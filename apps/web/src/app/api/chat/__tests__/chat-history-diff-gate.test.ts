import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockGetActivePendingAction } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockGetActivePendingAction: vi.fn(),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockOrderBy,
} = vi.hoisted(() => ({
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
  parsePaginationParams: vi.fn().mockReturnValue({ limit: 20, cursor: null }),
  paginatedResponse: vi.fn((rows: unknown[], limit: number) => ({
    data: (rows as Record<string, unknown>[]).slice(0, limit),
    pagination: { hasMore: false, nextCursor: null, count: rows.length },
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const CTX = { userId: "u1", companyId: "c1", role: "admin" };

function makeRequest(url: string): Request {
  return new Request(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/chat/history — diff-gate override restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetActivePendingAction.mockResolvedValue(null);

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it("restores the override delta on a kind:'permission' row", async () => {
    // conv found
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    // messages query
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce([]);

    const pendingRow = {
      pauseId: "p-perm",
      kind: "permission",
      pending: [
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
    };
    mockGetActivePendingAction.mockResolvedValueOnce(pendingRow);

    const { GET } = await import("../history/route");
    const res = await GET(makeRequest("http://localhost/api/chat/history?conversationId=conv1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pendingPermission.actions[0].override).toBeTruthy();
    expect(json.pendingPermission.actions[0].override[0].action).toBe("create");
    expect(json.pendingPlan).toBeNull();
  });
});
