import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { TurnEvent } from "@burnless/ai";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
// Task 3.3: the history reader projects the durable turn-event log. We mock the
// log accessors (getTurnEvents / getOpenGate) with REAL TurnEvent rows and let
// the real projectTimeline run, asserting the 5-field reload contract unchanged.

const { mockRequireCompanyAccess, mockGetTurnEvents, mockGetOpenGate } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetTurnEvents: vi.fn(),
  mockGetOpenGate: vi.fn(),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockOrderBy,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockOrderBy: vi.fn(),
}));

const { mockParsePaginationParams, mockPaginatedResponse } = vi.hoisted(
  () => ({
    mockParsePaginationParams: vi.fn().mockReturnValue({ limit: 20, cursor: null }),
    mockPaginatedResponse: vi.fn((rows: unknown[], limit: number) => ({ data: (rows as Record<string, unknown>[]).slice(0, limit), pagination: { hasMore: false, nextCursor: null, count: rows.length } })),
  })
);

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
  },
  aiConversations: {
    id: "id",
    companyId: "companyId",
    userId: "userId",
    updatedAt: "updatedAt",
  },
  getTurnEvents: mockGetTurnEvents,
  getOpenGate: mockGetOpenGate,
}));

// Real @burnless/ai: projectTimeline + categorizeToolName are pure; let them run.

vi.mock("@/lib/ai-tools", () => ({
  describeToolAction: vi.fn((tool: string) => `do ${tool}`),
  buildDomainToolCategories: vi.fn(() => ({})),
}));
vi.mock("@/lib/domains", () => ({
  domainRegistry: { getActiveTools: vi.fn(async () => []) },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  lt: vi.fn(),
}));

vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: mockParsePaginationParams,
  paginatedResponse: mockPaginatedResponse,
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const CTX = { userId: "u1", companyId: "c1", role: "admin" };

function makeRequest(url: string): Request {
  return new Request(url);
}

let seq = 0;
function ev(partial: Partial<TurnEvent> & { type: TurnEvent["type"]; payload: TurnEvent["payload"] }): TurnEvent {
  seq += 1;
  return {
    id: partial.id ?? `e${seq}`,
    conversationId: partial.conversationId ?? "conv1",
    seq: partial.seq ?? seq,
    turnId: partial.turnId ?? "turn1",
    resolvedAt: partial.resolvedAt ?? null,
    createdAt: partial.createdAt ?? new Date(),
    ...partial,
  } as TurnEvent;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/chat/history", () => {
  beforeEach(() => {
    seq = 0;
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    // Empty log + no open gate by default.
    mockGetTurnEvents.mockResolvedValue([]);
    mockGetOpenGate.mockResolvedValue(null);

    // DB chain setup: select -> from -> where -> orderBy / limit
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({
      limit: mockLimit,
      orderBy: mockOrderBy,
    });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);

    // Default pagination
    mockParsePaginationParams.mockReturnValue({ limit: 20, cursor: null });
    mockPaginatedResponse.mockReturnValue({
      data: [],
      pagination: { hasMore: false, nextCursor: null, count: 0 },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 for conversation not belonging to company", async () => {
    // const [conv] = await db.select(...).from(...).where(...)
    // where() must resolve to array for destructuring
    mockWhere.mockResolvedValueOnce([]); // not found

    const { GET } = await import("../history/route");
    const res = await GET(
      makeRequest("http://localhost/api/chat/history?conversationId=foreign-conv")
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Conversation not found");
  });

  it("returns messages for valid conversationId", async () => {
    // conv ownership found
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    // turn-event log: a user message then an assistant reply
    mockGetTurnEvents.mockResolvedValueOnce([
      ev({ type: "user_message", payload: { text: "Hello" } }),
      ev({ type: "assistant_step", payload: { text: "Hi there!" } }),
      ev({ type: "turn_done", payload: {} }),
    ]);

    const { GET } = await import("../history/route");
    const res = await GET(
      makeRequest("http://localhost/api/chat/history?conversationId=conv1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversationId).toBe("conv1");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[1].role).toBe("assistant");
    expect(body.messages[1].content).toBe("Hi there!");
    // Completed conversation → no live pending card.
    expect(body.pendingPermission).toBeNull();
    expect(body.pendingTimeline).toBeNull();
    expect(body.resumable).toBe(false);
  });

  it("returns paginated conversations when no conversationId", async () => {
    const conversations = [
      { id: "conv1", companyId: "c1", userId: "u1", title: "Budget review", updatedAt: new Date() },
      { id: "conv2", companyId: "c1", userId: "u1", title: "Runway analysis", updatedAt: new Date() },
    ];

    // Chain: db.select().from().where().orderBy().limit()
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce(conversations);
    mockPaginatedResponse.mockReturnValueOnce({
      data: conversations,
      pagination: { hasMore: false, nextCursor: null, count: conversations.length },
    });

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(mockParsePaginationParams).toHaveBeenCalled();
    expect(mockPaginatedResponse).toHaveBeenCalled();
    // The conversation-LIST branch never touches the turn-event log.
    expect(mockGetTurnEvents).not.toHaveBeenCalled();
  });

  it("returns empty list when no conversations exist", async () => {
    // Chain: where().orderBy().limit()
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([]);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
  });

  it("includes the active pending permission for a conversation (restore-on-reload)", async () => {
    // conv found
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    // log: user → assistant → an UNRESOLVED permission gate (events created in
    // seq order so the projection's seq-sort keeps the gate on the last turn).
    const events = [
      ev({ type: "user_message", payload: { text: "make a scenario" } }),
      ev({ type: "assistant_step", payload: { text: "" } }),
      ev({
        type: "gate",
        resolvedAt: null,
        payload: {
          pauseId: "pause-1",
          kind: "permission",
          actions: [{ requestId: "t1", toolName: "create_scenario", toolInput: { name: "QA" } }],
          scenarioId: "base",
          writeScenarioId: null,
        } as TurnEvent["payload"],
      }),
    ];
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(events[2]!);

    const { GET } = await import("../history/route");
    const res = await GET(
      makeRequest("http://localhost/api/chat/history?conversationId=conv1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pendingPermission).not.toBeNull();
    expect(body.pendingPermission.pauseId).toBe("pause-1");
    expect(body.pendingPermission.actions).toHaveLength(1);
    expect(body.pendingPermission.actions[0].tool).toBe("create_scenario");
    expect(body.pendingPermission.actions[0].category).toBe("write");
    expect(body.pendingPermission.actions[0].input).toEqual({ name: "QA" });
    // The lead-up timeline carries the mapped gate node too.
    expect(body.pendingTimeline).toBeTruthy();
    expect(body.resumable).toBe(true);
  });

  it("returns null pendingPermission when no paused turn exists", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockGetTurnEvents.mockResolvedValueOnce([
      ev({ type: "user_message", payload: { text: "hi" } }),
      ev({ type: "assistant_step", payload: { text: "hello" } }),
      ev({ type: "turn_done", payload: {} }),
    ]);
    // getOpenGate defaults to null (beforeEach)

    const { GET } = await import("../history/route");
    const res = await GET(
      makeRequest("http://localhost/api/chat/history?conversationId=conv1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pendingPermission).toBeNull();
  });

  // ── Genui reload restore ──────────────────────────────────────────────────

  it("returns pendingInput (and null pendingPermission) for an active input pause", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    const events = [
      ev({ type: "user_message", payload: { text: "add revenue" } }),
      ev({ type: "assistant_step", payload: { text: "" } }),
      ev({
        type: "gate",
        resolvedAt: null,
        payload: {
          pauseId: "pause-in",
          kind: "input",
          spec: {
            title: "Add a revenue stream",
            fields: [{ name: "name", type: "text", label: "Name", required: true }],
          },
          gatedToolUseId: "tu-1",
          scenarioId: "base",
          writeScenarioId: null,
        } as TurnEvent["payload"],
      }),
    ];
    mockGetTurnEvents.mockResolvedValueOnce(events);
    mockGetOpenGate.mockResolvedValueOnce(events[2]!);

    const { GET } = await import("../history/route");
    const res = await GET(
      makeRequest("http://localhost/api/chat/history?conversationId=conv1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pendingPermission).toBeNull();
    expect(body.pendingInput).not.toBeNull();
    expect(body.pendingInput.pauseId).toBe("pause-in");
    expect(body.pendingInput.conversationId).toBe("conv1");
    expect(body.pendingInput.spec.title).toBe("Add a revenue stream");
    expect(body.pendingInput.spec.fields).toHaveLength(1);
  });

  it("rehydrates uiBlocks from a tool_result render block", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockGetTurnEvents.mockResolvedValueOnce([
      ev({ type: "user_message", payload: { text: "show me MRR" } }),
      ev({
        type: "assistant_step",
        payload: { text: "Here it is", toolUses: [{ id: "tu-1", name: "show_mrr", input: {} }] },
      }),
      ev({
        type: "tool_result",
        payload: {
          toolUseId: "tu-1",
          toolName: "show_mrr",
          result: "ok",
          render: { component: "MetricCard", props: { value: 42 } },
        },
      }),
      ev({ type: "turn_done", payload: {} }),
    ]);

    const { GET } = await import("../history/route");
    const res = await GET(
      makeRequest("http://localhost/api/chat/history?conversationId=conv1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const assistant = body.messages.find((m: { role: string }) => m.role === "assistant");
    expect(assistant.uiBlocks).toHaveLength(1);
    expect(assistant.uiBlocks[0].component).toBe("MetricCard");
    expect(assistant.uiBlocks[0].props).toEqual({ value: 42 });
  });
});
