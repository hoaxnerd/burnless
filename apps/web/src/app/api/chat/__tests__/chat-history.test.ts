import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
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
    mockPaginatedResponse: vi.fn((rows: any[], limit: number) => ({ data: rows.slice(0, limit), nextCursor: null })),
  })
);

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: Function) => fn,
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
      nextCursor: null,
      hasMore: false,
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
      nextCursor: null,
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
    expect(body.hasMore).toBe(false);
  });
});
