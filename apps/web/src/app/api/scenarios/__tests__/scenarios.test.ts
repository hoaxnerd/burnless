/**
 * Tests for GET /api/scenarios and POST /api/scenarios.
 * Updated for overlay scenario system with override counts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole, mockRequirePlanFeature } =
  vi.hoisted(() => ({
    mockRequireCompanyAccess: vi.fn(),
    mockRequireRole: vi.fn().mockReturnValue(null),
    mockRequirePlanFeature: vi.fn(),
  }));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockOrderBy,
  mockInsert,
  mockValues,
  mockReturning,
  mockGetOverrideCount,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockGetOverrideCount: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  requirePlanFeature: mockRequirePlanFeature,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try { return { data: schema.parse(await req.json()) }; }
    catch { return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) }; }
  },
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect, insert: mockInsert },
  scenarios: { id: "id", companyId: "companyId", createdAt: "createdAt", deletedAt: "deletedAt" },
  getOverrideCount: mockGetOverrideCount,
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), gt: vi.fn(), isNull: vi.fn(),
  sql: Object.assign(vi.fn(() => "count(*)"), { raw: vi.fn() }),
}));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

describe("GET /api/scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
    mockGetOverrideCount.mockResolvedValue(0);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/scenarios", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns scenarios list with override counts", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "viewer" });
    const mockScenarios = [
      { id: "scen-1", companyId: "comp-1", name: "Growth Scenario", source: "blank" },
      { id: "scen-2", companyId: "comp-1", name: "Conservative", source: "ai" },
    ];
    mockOrderBy.mockResolvedValue(mockScenarios);
    mockGetOverrideCount.mockResolvedValueOnce(3).mockResolvedValueOnce(7);

    const res = await GET(jsonRequest("http://localhost/api/scenarios", "GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Growth Scenario");
    expect(body[0].overrideCount).toBe(3);
    expect(body[1].overrideCount).toBe(7);
    expect(mockGetOverrideCount).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("creates scenario with new fields (201)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "editor" });
    mockRequireRole.mockReturnValue(null);
    mockWhere.mockResolvedValueOnce([{ count: 1 }]);
    mockRequirePlanFeature.mockResolvedValue(null);

    const created = { id: "scen-new", companyId: "comp-1", name: "What If", source: "blank", description: "Test scenario", color: "#ff0000" };
    mockReturning.mockResolvedValue([created]);

    const res = await POST(jsonRequest("http://localhost/api/scenarios", "POST", {
      name: "What If",
      source: "blank",
      description: "Test scenario",
      color: "#ff0000",
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("scen-new");
    expect(body.name).toBe("What If");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("returns 403 with PLAN_LIMIT_REACHED when at limit", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "editor" });
    mockRequireRole.mockReturnValue(null);
    mockWhere.mockResolvedValueOnce([{ count: 3 }]);
    mockRequirePlanFeature.mockResolvedValue(
      NextResponse.json({ error: "Free plan is limited to 3 scenarios.", code: "PLAN_LIMIT_REACHED", upgradeTarget: "pro" }, { status: 403 })
    );

    const res = await POST(jsonRequest("http://localhost/api/scenarios", "POST", { name: "Over Limit" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("PLAN_LIMIT_REACHED");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(jsonRequest("http://localhost/api/scenarios", "POST", { name: "X" }));
    expect(res.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
