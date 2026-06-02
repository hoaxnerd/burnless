import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockGetActivePendingAction } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetActivePendingAction: vi.fn(),
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
  aiMessages: {
    conversationId: "conversationId",
    createdAt: "createdAt",
  },
  getActivePendingAction: mockGetActivePendingAction,
}));

// The route maps a persisted pending action to the permission-card payload on load
// (Plan 4 §6.5 #3); mock the classifier + describer it uses.
vi.mock("@burnless/ai", () => ({
  categorizeToolName: vi.fn(() => "write"),
}));

vi.mock("@/lib/ai-tools", () => ({
  describeToolAction: vi.fn((tool: string) => `do ${tool}`),
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/chat/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    // No paused turn by default.
    mockGetActivePendingAction.mockResolvedValue(null);

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
    const messages = [
      { id: "m1", conversationId: "conv1", role: "user", content: "Hello", createdAt: new Date() },
      { id: "m2", conversationId: "conv1", role: "assistant", content: "Hi there!", createdAt: new Date() },
    ];

    // First query: const [conv] = await db.select().from().where()
    // where() must resolve to array
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]); // found

    // Second query: db.select().from().where().orderBy()
    // where() returns chain object, orderBy() resolves to messages
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce(messages);

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
    // messages query
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce([]);
    // an unresolved paused turn exists
    mockGetActivePendingAction.mockResolvedValueOnce({
      pauseId: "pause-1",
      pending: [{ requestId: "t1", toolName: "create_scenario", toolInput: { name: "QA" } }],
    });

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
  });

  it("returns null pendingPermission when no paused turn exists", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce([]);
    // mockGetActivePendingAction defaults to null (beforeEach)

    const { GET } = await import("../history/route");
    const res = await GET(
      makeRequest("http://localhost/api/chat/history?conversationId=conv1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pendingPermission).toBeNull();
  });

  // ── Genui reload restore (Plan 4 Task 5) ──────────────────────────────────

  it("returns pendingInput (and null pendingPermission) for an active input pause", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce([]);
    // an unresolved input pause exists
    mockGetActivePendingAction.mockResolvedValueOnce({
      pauseId: "pause-in",
      kind: "input",
      pending: {
        inputToolUseId: "tu-1",
        spec: {
          title: "Add a revenue stream",
          fields: [{ name: "name", type: "text", label: "Name", required: true }],
        },
      },
    });

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

  it("rehydrates uiBlocks from stored message metadata", async () => {
    const messages = [
      { id: "m1", conversationId: "conv1", role: "user", content: "show me MRR", createdAt: new Date(), metadata: null },
      {
        id: "m2",
        conversationId: "conv1",
        role: "assistant",
        content: "Here it is",
        createdAt: new Date(),
        metadata: { uiBlocks: [{ id: "b1", component: "MetricCard", props: { value: 42 } }] },
      },
    ];

    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce(messages);

    const { GET } = await import("../history/route");
    const res = await GET(
      makeRequest("http://localhost/api/chat/history?conversationId=conv1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].uiBlocks).toBeUndefined();
    expect(body.messages[1].uiBlocks).toEqual([
      { id: "b1", component: "MetricCard", props: { value: 42 } },
    ]);
  });
});
