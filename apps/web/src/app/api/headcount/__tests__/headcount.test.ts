/**
 * Tests for GET /api/headcount and POST /api/headcount.
 * Updated for overlay scenario system.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockSelect, mockFrom, mockWhere, mockResolveEntities, mockScenarioInsert } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockResolveEntities: vi.fn(),
  mockScenarioInsert: vi.fn(),
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
  headcountPlans: { companyId: "companyId", id: "id" },
  resolveEntities: mockResolveEntities,
  scenarioInsert: mockScenarioInsert,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gt: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "owner" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe("GET /api/headcount", () => {
  it("returns resolved headcount plans (no scenario)", async () => {
    const base = [
      { id: "hc-1", departmentId: "dept-1", title: "Senior Engineer", count: 2, salary: "120000", benefitsRate: "0.20" },
      { id: "hc-2", departmentId: "dept-2", title: "Designer", count: 1, salary: "100000", benefitsRate: "0.20" },
    ];
    mockWhere.mockResolvedValue(base);
    mockResolveEntities.mockResolvedValue(base.map((e) => ({ ...e, _override: null })));

    const res = await GET(jsonRequest("http://localhost/api/headcount", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].title).toBe("Senior Engineer");
    expect(mockResolveEntities).toHaveBeenCalledWith("headcount_plan", base, null);
  });

  it("passes scenarioId from header", async () => {
    mockGetActiveScenario.mockReturnValue("scen-1");
    mockWhere.mockResolvedValue([]);
    mockResolveEntities.mockResolvedValue([]);

    await GET(jsonRequest("http://localhost/api/headcount", "GET"));
    expect(mockResolveEntities).toHaveBeenCalledWith("headcount_plan", [], "scen-1");
  });
});

describe("POST /api/headcount", () => {
  it("creates headcount plan via scenarioInsert (201)", async () => {
    const created = { id: "hc-new", departmentId: "dept-1", title: "Product Manager", companyId: "comp-1" };
    mockScenarioInsert.mockResolvedValue(created);

    const res = await POST(jsonRequest("http://localhost/api/headcount", "POST", {
      departmentId: "dept-1",
      title: "Product Manager",
      count: 1,
      salary: 130000,
      startDate: "2026-01-01",
      benefitsRate: 0.25,
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("hc-new");
    expect(mockScenarioInsert).toHaveBeenCalledWith(
      "headcount_plan", expect.anything(),
      expect.objectContaining({ departmentId: "dept-1", companyId: "comp-1" }),
      null,
    );
  });

  it("returns 403 for viewer", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(jsonRequest("http://localhost/api/headcount", "POST", {
      departmentId: "dept-1", title: "X", salary: 100000, startDate: "2026-01-01",
    }));
    expect(res.status).toBe(403);
    expect(mockScenarioInsert).not.toHaveBeenCalled();
  });
});
