// Task 3.3: the history reader projects the durable turn-event log into the
// exact 5-field reload contract (messages w/ per-turn timeline+uiBlocks,
// pendingPermission/Input/Plan with override, pendingTimeline, resumable). These
// tests cover the four reload states a client can land on: open RECENT gate,
// open STALE gate, COMPLETED conversation, and mid-stream (no turn_done, no gate).
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TurnEvent } from "@burnless/ai";

const { mockRequireCompanyAccess, mockGetTurnEvents, mockGetOpenGate } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetTurnEvents: vi.fn(),
  mockGetOpenGate: vi.fn(),
}));

const { mockSelect, mockFrom, mockWhere, mockOrderBy } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  aiConversations: { id: "id", companyId: "companyId", userId: "userId", updatedAt: "updatedAt" },
  getTurnEvents: mockGetTurnEvents,
  getOpenGate: mockGetOpenGate,
}));

vi.mock("@/lib/ai-tools", () => ({ describeToolAction: vi.fn((tool: string) => `do ${tool}`) }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), desc: vi.fn(), asc: vi.fn(), lt: vi.fn() }));
vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: vi.fn().mockReturnValue({ limit: 20, cursor: null }),
  paginatedResponse: vi.fn((rows: unknown[], limit: number) => ({ data: rows.slice(0, limit) })),
}));
vi.mock("@/lib/logger", () => ({ logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

const CTX = { userId: "u1", companyId: "c1", role: "admin" };
const makeRequest = (url: string): Request => new Request(url);

let seq = 0;
function ev(partial: Partial<TurnEvent> & { type: TurnEvent["type"]; payload: TurnEvent["payload"] }): TurnEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    conversationId: "conv1",
    seq,
    turnId: "turn1",
    resolvedAt: null,
    createdAt: new Date(),
    ...partial,
  } as TurnEvent;
}

/** user → assistant → an UNRESOLVED permission gate (with an override delta), the
 *  gate event stamped with `createdAt`. */
function pausedPermissionLog(createdAt: Date): { events: TurnEvent[]; gate: TurnEvent } {
  const events = [
    ev({ type: "user_message", payload: { text: "add a revenue stream" } }),
    ev({ type: "assistant_step", payload: { text: "Sure — here's the change." } }),
    ev({
      type: "gate",
      resolvedAt: null,
      createdAt,
      payload: {
        pauseId: "pause-1",
        kind: "permission",
        actions: [
          {
            requestId: "tu-w",
            toolName: "create_revenue_stream",
            toolInput: { name: "Pro Plan" },
            override: [
              { action: "create", entityType: "revenue_stream", entityId: "id1", before: null, after: { name: "Pro Plan" } },
            ],
          },
        ],
        scenarioId: "base",
        writeScenarioId: null,
      } as TurnEvent["payload"],
    }),
  ];
  return { events, gate: events[2]! };
}

describe("GET /api/chat/history — reload restore (Task 3.3)", () => {
  beforeEach(() => {
    seq = 0;
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetTurnEvents.mockResolvedValue([]);
    mockGetOpenGate.mockResolvedValue(null);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it("open RECENT gate → resumable:true + live pendingPermission WITH override deltas", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const { events, gate } = pausedPermissionLog(new Date()); // within TTL
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(gate);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.resumable).toBe(true);
    expect(json.pendingPermission).not.toBeNull();
    expect(json.pendingPermission.actions[0].override[0].action).toBe("create");
    expect(json.pendingPermission.actions[0].tool).toBe("create_revenue_stream");
    // pendingTimeline carries the lead-up text + the live (unresolved) gate node.
    const gateNode = json.pendingTimeline.find((n: { kind: string }) => n.kind === "diff_gate");
    expect(gateNode.resolved).toBe(false);
    expect(gateNode.pending.actions[0].override[0].action).toBe("create");
  });

  it("open STALE gate (> 30 min) → resumable:false (inert; composer not locked)", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const { events, gate } = pausedPermissionLog(new Date(Date.now() - 31 * 60 * 1000)); // past TTL
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(gate);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.resumable).toBe(false);
    // The pending card is still surfaced; the client renders it inert per resumable.
    expect(json.pendingPermission).not.toBeNull();
    expect(json.pendingTimeline).toBeTruthy();
  });

  it("COMPLETED conversation (no open gate) → no pending fields, per-message timelines intact", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockGetTurnEvents.mockResolvedValueOnce([
      ev({ type: "user_message", payload: { text: "how's runway?" } }),
      ev({ type: "assistant_step", payload: { text: "Healthy.", toolUses: [{ id: "tu-1", name: "show_runway", input: {} }] } }),
      ev({ type: "tool_result", payload: { toolUseId: "tu-1", toolName: "show_runway", result: "ok" } }),
      ev({ type: "turn_done", payload: {} }),
    ]);
    // getOpenGate → null (beforeEach)

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pendingPermission).toBeNull();
    expect(json.pendingInput).toBeNull();
    expect(json.pendingPlan).toBeNull();
    expect(json.pendingTimeline).toBeNull();
    expect(json.resumable).toBe(false);
    const assistant = json.messages.find((m: { role: string }) => m.role === "assistant");
    expect(assistant.timeline.some((n: { kind: string }) => n.kind === "tool")).toBe(true);
    // getOpenGate must NOT be queried when no gate is open... it always is, but
    // returns null, so resumable stays false. The contract is what matters.
  });

  it("mid-stream (assistant_step + tool_result, no turn_done, no gate) → messages present, no pending card", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockGetTurnEvents.mockResolvedValueOnce([
      ev({ type: "user_message", payload: { text: "compute MRR" } }),
      ev({ type: "assistant_step", payload: { text: "Working on it.", toolUses: [{ id: "tu-1", name: "show_mrr", input: {} }] } }),
      ev({ type: "tool_result", payload: { toolUseId: "tu-1", toolName: "show_mrr", result: "ok", render: { component: "MetricCard", props: { value: 42 } } } }),
      // no turn_done, no gate — the turn is mid-flight
    ]);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.messages).toHaveLength(2);
    const assistant = json.messages.find((m: { role: string }) => m.role === "assistant");
    expect(assistant.uiBlocks[0].component).toBe("MetricCard");
    expect(json.pendingPermission).toBeNull();
    expect(json.pendingInput).toBeNull();
    expect(json.pendingPlan).toBeNull();
    expect(json.pendingTimeline).toBeNull();
    expect(json.resumable).toBe(false);
  });
});
