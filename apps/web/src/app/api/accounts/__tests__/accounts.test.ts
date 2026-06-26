/**
 * Tests for GET /api/accounts and POST /api/accounts.
 * Updated for overlay scenario system.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockSelect, mockFrom, mockWhere, mockOrderBy, mockResolveEntities, mockScenarioInsert } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockResolveEntities: vi.fn(),
  mockScenarioInsert: vi.fn(),
}));
const { mockCountFrom, mockCountWhere, mockCountGroupBy } = vi.hoisted(() => ({
  mockCountFrom: vi.fn(),
  mockCountWhere: vi.fn(),
  mockCountGroupBy: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try { return { data: schema.parse(await req.json()) }; }
    catch { return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) }; }
  },
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  financialAccounts: { companyId: "companyId", sortOrder: "sortOrder", id: "id" },
  transactions: { companyId: "companyId", accountId: "accountId" },
  resolveEntities: mockResolveEntities,
  scenarioInsert: mockScenarioInsert,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gt: vi.fn(), sql: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { GET, POST } from "../route";

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "owner" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  // First select() → accounts chain (.from().where().orderBy()); second → count chain (.from().where().groupBy())
  mockSelect
    .mockReturnValueOnce({ from: mockFrom })
    .mockReturnValueOnce({ from: mockCountFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockCountFrom.mockReturnValue({ where: mockCountWhere });
  mockCountWhere.mockReturnValue({ groupBy: mockCountGroupBy });
});

describe("GET /api/accounts", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(makeRequest("http://localhost/api/accounts"));
    expect(res.status).toBe(401);
  });

  it("returns resolved accounts list", async () => {
    const base = [
      { id: "acc-1", name: "Revenue", type: "income", category: "revenue", sortOrder: 0 },
      { id: "acc-2", name: "Operating Expenses", type: "expense", category: "operating_expense", sortOrder: 1 },
    ];
    mockOrderBy.mockResolvedValue(base);
    mockResolveEntities.mockResolvedValue(base.map((e) => ({ ...e, _override: null })));
    mockCountGroupBy.mockResolvedValue([]);

    const res = await GET(makeRequest("http://localhost/api/accounts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Revenue");
    expect(mockResolveEntities).toHaveBeenCalledWith("financial_account", base, null);
  });

  it("attaches a transactionCount to each resolved account", async () => {
    const base = [
      { id: "acc-1", name: "Revenue", type: "income", category: "revenue", sortOrder: 0 },
      { id: "acc-2", name: "Cash & Bank", type: "asset", category: "asset", sortOrder: 1 },
    ];
    mockOrderBy.mockResolvedValue(base);
    mockResolveEntities.mockResolvedValue(base.map((e) => ({ ...e, _override: null })));
    mockCountGroupBy.mockResolvedValue([{ accountId: "acc-1", count: 4 }]); // acc-2 absent ⇒ 0

    const res = await GET(makeRequest("http://localhost/api/accounts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.find((a: { id: string }) => a.id === "acc-1").transactionCount).toBe(4);
    expect(body.find((a: { id: string }) => a.id === "acc-2").transactionCount).toBe(0);
  });
});

describe("POST /api/accounts", () => {
  it("creates account via scenarioInsert (201)", async () => {
    const created = { id: "acc-new", companyId: "company-1", name: "Marketing Expenses", type: "expense", category: "operating_expense" };
    mockScenarioInsert.mockResolvedValue(created);

    const res = await POST(makeRequest("http://localhost/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Marketing Expenses", type: "expense", category: "operating_expense", sortOrder: 5 }),
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("acc-new");
    expect(mockScenarioInsert).toHaveBeenCalledWith(
      "financial_account", expect.anything(),
      expect.objectContaining({ name: "Marketing Expenses", companyId: "company-1" }),
      null,
      "company-1",
    );
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(makeRequest("http://localhost/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", type: "income", category: "revenue" }),
    }));
    expect(res.status).toBe(403);
    expect(mockScenarioInsert).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body (missing name)", async () => {
    const res = await POST(makeRequest("http://localhost/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "income", category: "revenue" }),
    }));
    expect(res.status).toBe(400);
  });
});
