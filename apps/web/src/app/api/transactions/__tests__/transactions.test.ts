import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireWrite, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireWrite: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/date-validation", () => ({ parseISODate: (s: string) => new Date(s) }));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockInsert,
  mockValues,
  mockReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireCompanyWrite: mockRequireWrite,
  requireRole: mockRequireRole,
  parseBody: async (
    req: Request,
    schema: { parse: (d: unknown) => unknown }
  ) => {
    try {
      const body = await req.json();
      return { data: schema.parse(body) };
    } catch {
      return {
        error: NextResponse.json(
          { error: "Validation failed" },
          { status: 400 }
        ),
      };
    }
  },
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
  transactions: {
    companyId: "companyId",
    accountId: "accountId",
    date: "date",
    id: "id",
  },
  financialAccounts: {
    id: "id",
    companyId: "companyId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  gt: vi.fn(),
}));

vi.mock("@/lib/pagination", () => ({
  parsePaginationParams: vi
    .fn()
    .mockReturnValue({ limit: 50, cursor: null }),
  paginatedResponse: vi
    .fn()
    .mockImplementation((rows: unknown[], limit: number) => ({
      data: rows.slice(0, limit),
      pagination: {
        hasMore: rows.length > limit,
        nextCursor: null,
        count: Math.min(rows.length, limit),
      },
    })),
}));

// GET chain: db.select().from(transactions).where(and(...)).orderBy(transactions.id).limit(limit + 1)
// POST chain (AUTHZ-02 ownership): db.select({...}).from(financialAccounts).where(...) — awaited.
// So mockWhere returns a thenable that ALSO exposes .orderBy (GET) and resolves to
// the financialAccounts ownership rows (POST). By default: one row found (owned).
function makeWhereResult() {
  const result: Record<string, unknown> = { orderBy: mockOrderBy };
  // Thenable: awaiting `where(...)` resolves to the ownership lookup rows.
  result.then = (resolve: (v: unknown) => unknown) => resolve([{ id: "acc-1" }]);
  return result;
}
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockImplementation(() => makeWhereResult());
mockOrderBy.mockReturnValue({ limit: mockLimit });

// Chain: db.insert(transactions).values({...}).returning()
mockInsert.mockReturnValue({ values: mockValues });
mockValues.mockReturnValue({ returning: mockReturning });

import { GET, POST } from "../route";

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

describe("GET /api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish chains after clearAllMocks
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockImplementation(() => {
      const result: Record<string, unknown> = { orderBy: mockOrderBy };
      result.then = (resolve: (v: unknown) => unknown) => resolve([{ id: "acc-1" }]);
      return result;
    });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = makeRequest("http://localhost/api/transactions");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns paginated transactions", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "admin",
    });

    const mockRows = [
      {
        id: "txn-1",
        companyId: "company-1",
        accountId: "acc-1",
        amount: "100.00",
        date: new Date("2026-01-01"),
        description: "Test transaction",
      },
      {
        id: "txn-2",
        companyId: "company-1",
        accountId: "acc-1",
        amount: "200.00",
        date: new Date("2026-01-02"),
        description: "Another transaction",
      },
    ];
    mockLimit.mockResolvedValue(mockRows);

    const req = makeRequest("http://localhost/api/transactions");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.hasMore).toBe(false);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("filters by accountId", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "admin",
    });

    const mockRows = [
      {
        id: "txn-1",
        companyId: "company-1",
        accountId: "acc-42",
        amount: "500.00",
        date: new Date("2026-02-01"),
        description: "Filtered transaction",
      },
    ];
    mockLimit.mockResolvedValue(mockRows);

    const { eq } = await import("drizzle-orm");
    const req = makeRequest(
      "http://localhost/api/transactions?accountId=acc-42"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    // eq should be called for companyId and accountId
    expect(eq).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockImplementation(() => {
      const result: Record<string, unknown> = { orderBy: mockOrderBy };
      result.then = (resolve: (v: unknown) => unknown) => resolve([{ id: "acc-1" }]);
      return result;
    });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });

    // POST now gates on requireCompanyWrite — default to a passing write ctx.
    mockRequireWrite.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "editor",
    });

    // Default: base view active (no scenario) — POST is allowed.
    mockGetActiveScenario.mockReturnValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireWrite.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = makeRequest("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "acc-1",
        date: "2026-01-01",
        amount: 100,
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when accountId belongs to another company", async () => {
    // Ownership lookup returns no rows → foreign account.
    mockWhere.mockImplementation(() => {
      const result: Record<string, unknown> = { orderBy: mockOrderBy };
      result.then = (resolve: (v: unknown) => unknown) => resolve([]);
      return result;
    });

    const req = makeRequest("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "foreign-acc",
        date: "2026-03-15",
        amount: 250,
        description: "Cross-company attempt",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain("does not belong");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates transaction and returns 201", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "editor",
    });

    const createdRow = {
      id: "txn-new",
      companyId: "company-1",
      accountId: "acc-1",
      date: new Date("2026-03-15"),
      amount: "250.00",
      description: "New transaction",
      source: "manual",
      externalId: null,
      metadata: null,
    };
    mockReturning.mockResolvedValue([createdRow]);

    const req = makeRequest("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "acc-1",
        date: "2026-03-15",
        amount: 250,
        description: "New transaction",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("txn-new");
    expect(body.accountId).toBe("acc-1");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
    expect(mockReturning).toHaveBeenCalled();
  });

  it("returns 400 for invalid body (missing accountId)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "editor",
    });

    const req = makeRequest("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-03-15",
        amount: 100,
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("persists vendor on create", async () => {
    const createdRow = {
      id: "txn-v", companyId: "company-1", accountId: "acc-1",
      date: new Date("2026-03-15"), amount: "250.00", description: "Lunch",
      vendor: "Acme", notes: null, source: "manual", externalId: null, metadata: null,
    };
    mockReturning.mockResolvedValue([createdRow]);
    const req = makeRequest("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "acc-1", date: "2026-03-15", amount: 250, description: "Lunch", vendor: "Acme" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.vendor).toBe("Acme");
  });

  it("refuses POST with 409 when a non-base scenario is active", async () => {
    mockGetActiveScenario.mockReturnValue("scenario-99");
    const req = makeRequest("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "acc-1", date: "2026-03-15", amount: 250 }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/base view/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
