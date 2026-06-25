import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TurnEvent } from "@burnless/ai";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Task 3.3 (was Plan 5): pendingTimeline is the open gate's full lead-up rendered
// as ONE timeline on the last assistant turn. It is now PROJECTED from the log
// (the gate-owning assistant message's timeline) rather than read off a stored
// pending-row blob; null when there is no open gate.

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
    conversationId: "cv1",
    seq,
    turnId: "turn1",
    resolvedAt: null,
    createdAt: new Date(),
    ...partial,
  } as TurnEvent;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/chat/history — full-run pendingTimeline (Plan 5)", () => {
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

  it("returns pendingTimeline = the open gate's projected lead-up timeline", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "cv1" }]);
    const events = [
      ev({ type: "user_message", payload: { text: "model a hire" } }),
      ev({ type: "assistant_step", payload: { text: "hi" } }),
      ev({
        type: "gate",
        resolvedAt: null,
        payload: {
          pauseId: "p1",
          kind: "plan",
          spec: { title: "x", steps: [] },
          gatedToolUseId: "tu-p",
          scenarioId: "base",
          writeScenarioId: null,
        } as TurnEvent["payload"],
      }),
    ];
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(events[2]!);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=cv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pendingTimeline).toBeTruthy();
    // The lead-up text result + the live plan gate node, in order.
    expect(json.pendingTimeline.map((n: { kind: string }) => n.kind)).toEqual(["result", "plan"]);
    const planNode = json.pendingTimeline.find((n: { kind: string }) => n.kind === "plan");
    expect(planNode.plan.spec.title).toBe("x");
  });

  it("returns null pendingTimeline when there is no open gate", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "cv1" }]);
    mockGetTurnEvents.mockResolvedValueOnce([
      ev({ type: "user_message", payload: { text: "hi" } }),
      ev({ type: "assistant_step", payload: { text: "hello" } }),
      ev({ type: "turn_done", payload: {} }),
    ]);
    // getOpenGate defaults to null (beforeEach)

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=cv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pendingTimeline).toBeNull();
  });
});
