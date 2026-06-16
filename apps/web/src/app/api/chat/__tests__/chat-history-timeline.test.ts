import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TurnEvent } from "@burnless/ai";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// Task 3.3: each assistant turn's timeline is PROJECTED from the log (tool nodes
// from assistant_step.toolUses, result/text nodes), not lifted from a stored
// metadata blob. Asserts the per-message timeline shape the client consumes.

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

describe("GET /api/chat/history — timeline projection", () => {
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

  it("projects a tool node + a text result node onto the assistant turn", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockGetTurnEvents.mockResolvedValueOnce([
      ev({ type: "user_message", payload: { text: "how's runway?" } }),
      ev({
        type: "assistant_step",
        payload: { text: "Healthy.", toolUses: [{ id: "tu-1", name: "show_runway", input: {} }] },
      }),
      ev({ type: "tool_result", payload: { toolUseId: "tu-1", toolName: "show_runway", result: "ok" } }),
      ev({ type: "turn_done", payload: {} }),
    ]);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    const msg = json.messages.find((m: { role: string }) => m.role === "assistant");
    expect(msg.timeline).toBeTruthy();
    // assistant_step emits a text result node + a tool node (order: text, tool).
    expect(msg.timeline.map((n: { kind: string }) => n.kind)).toEqual(["result", "tool"]);
    const tool = msg.timeline.find((n: { kind: string }) => n.kind === "tool");
    expect(tool.toolName).toBe("show_runway");
    expect(tool.phase).toBe("done");
  });
});
