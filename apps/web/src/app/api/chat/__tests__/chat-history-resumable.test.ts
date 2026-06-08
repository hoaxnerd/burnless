// AI-09: GET /api/chat/history surfaces a `resumable` flag derived from the
// pending row's createdAt freshness (30-minute TTL). A genuinely-just-paused run
// is resumable (live gate); an old historical pause is not (restored inert).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireCompanyAccess, mockGetActivePendingAction } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetActivePendingAction: vi.fn(),
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
  aiMessages: { conversationId: "conversationId", createdAt: "createdAt" },
  getActivePendingAction: mockGetActivePendingAction,
}));

vi.mock("@burnless/ai", () => ({ categorizeToolName: vi.fn(() => "write") }));
vi.mock("@/lib/ai-tools", () => ({ describeToolAction: vi.fn((tool: string) => `do ${tool}`) }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), desc: vi.fn(), asc: vi.fn(), lt: vi.fn() }));
vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: vi.fn().mockReturnValue({ limit: 20, cursor: null }),
  paginatedResponse: vi.fn((rows: unknown[], limit: number) => ({ data: rows.slice(0, limit) })),
}));
vi.mock("@/lib/logger", () => ({ logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

const CTX = { userId: "u1", companyId: "c1", role: "admin" };
const makeRequest = (url: string): Request => new Request(url);

describe("GET /api/chat/history — resumable flag (AI-09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetActivePendingAction.mockResolvedValue(null);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  function primeConvAndMessages() {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]); // conv ownership
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy }); // messages query
    mockOrderBy.mockResolvedValueOnce([]);
  }

  it("returns resumable:true for a fresh (just-paused) pending row", async () => {
    primeConvAndMessages();
    mockGetActivePendingAction.mockResolvedValueOnce({
      pauseId: "p-fresh",
      kind: "permission",
      pending: [{ requestId: "t1", toolName: "create_scenario", toolInput: {} }],
      createdAt: new Date(), // now → within TTL
    });

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.resumable).toBe(true);
    expect(json.pendingPermission).not.toBeNull();
  });

  it("returns resumable:false for an old (historical) pending row", async () => {
    primeConvAndMessages();
    mockGetActivePendingAction.mockResolvedValueOnce({
      pauseId: "p-old",
      kind: "permission",
      pending: [{ requestId: "t1", toolName: "create_scenario", toolInput: {} }],
      createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago → past 30-min TTL
    });

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.resumable).toBe(false);
    // The pending payload is still returned; the client decides to render it inert.
    expect(json.pendingPermission).not.toBeNull();
  });

  it("returns resumable:false when there is no pending row", async () => {
    primeConvAndMessages();
    mockGetActivePendingAction.mockResolvedValueOnce(null);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.resumable).toBe(false);
    expect(json.pendingPermission).toBeNull();
  });
});
