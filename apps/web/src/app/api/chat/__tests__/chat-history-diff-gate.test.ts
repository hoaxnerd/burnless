import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TurnEvent } from "@burnless/ai";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Task 3.3: history projects the turn-event log. The diff-gate override delta is
// persisted on the gate event's `actions[].override` (chat-stream.ts onPause);
// the reader maps it to the client PermissionAction shape unchanged.

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/chat/history — diff-gate override restore", () => {
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

  it("restores the override delta on a kind:'permission' gate", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const events = [
      ev({ type: "user_message", payload: { text: "add a plan" } }),
      ev({ type: "assistant_step", payload: { text: "" } }),
      ev({
        type: "gate",
        resolvedAt: null,
        payload: {
          pauseId: "p-perm",
          kind: "permission",
          actions: [
            {
              requestId: "tu-w",
              toolName: "create_revenue_stream",
              toolInput: { name: "Pro Plan" },
              override: [
                {
                  action: "create",
                  entityType: "revenue_stream",
                  entityId: "id1",
                  before: null,
                  after: { id: "id1", name: "Pro Plan" },
                },
              ],
            },
          ],
          scenarioId: "base",
          writeScenarioId: null,
        } as TurnEvent["payload"],
      }),
    ];
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(events[2]!);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pendingPermission.actions[0].override).toBeTruthy();
    expect(json.pendingPermission.actions[0].override[0].action).toBe("create");
    expect(json.pendingPlan).toBeNull();
    // The lead-up timeline node carries the SAME mapped override.
    const gateNode = json.pendingTimeline.find((n: { kind: string }) => n.kind === "diff_gate");
    expect(gateNode.pending.actions[0].override[0].action).toBe("create");
  });
});
