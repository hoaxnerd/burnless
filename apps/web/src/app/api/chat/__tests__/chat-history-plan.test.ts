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

describe("GET /api/chat/history — plan restore (kind guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue(CTX);
    mockGetActivePendingAction.mockResolvedValue(null);

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it("returns pendingPlan (not pendingPermission/pendingInput) for a kind:'plan' row", async () => {
    // conv found
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    // messages query
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce([]);

    mockGetActivePendingAction.mockResolvedValueOnce({
      pauseId: "p-plan",
      kind: "plan",
      pending: {
        planToolUseId: "tu-p",
        spec: { title: "Model hire", steps: [] },
      },
    });

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

  it("does not break kind:'permission' rows after guard fix (regression)", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce([]);

    mockGetActivePendingAction.mockResolvedValueOnce({
      pauseId: "p-perm",
      kind: "permission",
      pending: [{ requestId: "t1", toolName: "create_scenario", toolInput: { name: "QA" } }],
    });

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

  it("does not break kind:'input' rows after guard fix (regression)", async () => {
    mockWhere.mockResolvedValueOnce([{ id: "conv1" }]);
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce([]);

    mockGetActivePendingAction.mockResolvedValueOnce({
      pauseId: "p-input",
      kind: "input",
      pending: {
        inputToolUseId: "tu-i",
        spec: { title: "Fill form", fields: [] },
      },
    });

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
