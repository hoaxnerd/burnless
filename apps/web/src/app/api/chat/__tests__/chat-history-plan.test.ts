import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TurnEvent } from "@burnless/ai";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Task 3.3: the history reader projects the durable turn-event log; mock the log
// accessors with real events and let projectTimeline run. Asserts the per-kind
// gate guard (plan vs permission vs input) on the 5-field reload contract.

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

// ── Module mocks ──────────────────────────────────────────────────────────────

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

vi.mock("@/lib/ai-tools", () => ({
  describeToolAction: vi.fn((tool: string) => `do ${tool}`),
  buildDomainToolCategories: vi.fn(() => ({})),
}));
vi.mock("@/lib/domains", () => ({
  domainRegistry: { getActiveTools: vi.fn(async () => []) },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), desc: vi.fn(), asc: vi.fn(), lt: vi.fn() }));

vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: vi.fn().mockReturnValue({ limit: 20, cursor: null }),
  paginatedResponse: vi.fn((rows: unknown[], limit: number) => ({
    data: (rows as Record<string, unknown>[]).slice(0, limit),
    pagination: { hasMore: false, nextCursor: null, count: rows.length },
  })),
}));

vi.mock("@/lib/logger", () => ({ logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** A paused conversation: user → assistant → an UNRESOLVED gate of the given kind. */
function pausedLog(payload: TurnEvent["payload"]): TurnEvent[] {
  return [
    ev({ type: "user_message", payload: { text: "go" } }),
    ev({ type: "assistant_step", payload: { text: "" } }),
    ev({ type: "gate", resolvedAt: null, payload }),
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/chat/history — plan restore (kind guard)", () => {
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

  it("returns pendingPlan (not pendingPermission/pendingInput) for a kind:'plan' row", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const events = pausedLog({
      pauseId: "p-plan",
      kind: "plan",
      spec: { title: "Model hire", steps: [] },
      gatedToolUseId: "tu-p",
      scenarioId: "base",
      writeScenarioId: null,
    } as TurnEvent["payload"]);
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(events[2]!);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pendingPermission).toBeNull();
    expect(json.pendingInput).toBeNull();
    expect(json.pendingPlan).not.toBeNull();
    expect(json.pendingPlan.pauseId).toBe("p-plan");
    expect(json.pendingPlan.conversationId).toBe("conv1");
    expect(json.pendingPlan.spec.title).toBe("Model hire");
  });

  it("does not break kind:'permission' rows (regression)", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const events = pausedLog({
      pauseId: "p-perm",
      kind: "permission",
      actions: [{ requestId: "t1", toolName: "create_scenario", toolInput: { name: "QA" } }],
      scenarioId: "base",
      writeScenarioId: null,
    } as TurnEvent["payload"]);
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(events[2]!);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pendingPermission).not.toBeNull();
    expect(json.pendingPermission.pauseId).toBe("p-perm");
    expect(json.pendingPermission.actions[0].tool).toBe("create_scenario");
    expect(json.pendingInput).toBeNull();
    expect(json.pendingPlan).toBeNull();
  });

  it("does not break kind:'input' rows (regression)", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const events = pausedLog({
      pauseId: "p-input",
      kind: "input",
      spec: { title: "Fill form", fields: [] },
      gatedToolUseId: "tu-i",
      scenarioId: "base",
      writeScenarioId: null,
    } as TurnEvent["payload"]);
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(events[2]!);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pendingPermission).toBeNull();
    expect(json.pendingInput).not.toBeNull();
    expect(json.pendingInput.pauseId).toBe("p-input");
    expect(json.pendingPlan).toBeNull();
  });
});
