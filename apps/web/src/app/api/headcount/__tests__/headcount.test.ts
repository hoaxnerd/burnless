import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockInsert,
  mockValues,
  mockReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
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
  headcountPlans: {
    id: "id",
    scenarioId: "scenarioId",
    departmentId: "departmentId",
    title: "title",
    count: "count",
    salary: "salary",
    startDate: "startDate",
    endDate: "endDate",
    benefitsRate: "benefitsRate",
  },
  scenarios: {
    id: "id",
    companyId: "companyId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditBatch: vi.fn() }));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

describe("GET /api/headcount", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("returns 400 when scenarioId missing", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    const req = jsonRequest("http://localhost/api/headcount", "GET");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("scenarioId required");
  });

  it("returns 404 when scenario not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    // First where() call for scenario lookup returns empty
    mockWhere.mockResolvedValueOnce([]);

    const req = jsonRequest(
      "http://localhost/api/headcount?scenarioId=scen-1",
      "GET"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Scenario not found");
  });

  it("returns headcount plans for valid scenario", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    const scenario = { id: "scen-1", companyId: "comp-1", name: "Base" };
    const plans = [
      {
        id: "hc-1",
        scenarioId: "scen-1",
        departmentId: "dept-1",
        title: "Senior Engineer",
        count: 2,
        salary: "120000",
        benefitsRate: "0.20",
      },
      {
        id: "hc-2",
        scenarioId: "scen-1",
        departmentId: "dept-2",
        title: "Designer",
        count: 1,
        salary: "100000",
        benefitsRate: "0.20",
      },
    ];

    // First where() for scenario lookup, second where() for headcount plans
    mockWhere.mockResolvedValueOnce([scenario]).mockResolvedValueOnce(plans);

    const req = jsonRequest(
      "http://localhost/api/headcount?scenarioId=scen-1",
      "GET"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].title).toBe("Senior Engineer");
    expect(body[1].title).toBe("Designer");
  });
});

describe("POST /api/headcount", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("creates headcount plan (201)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);

    const scenario = { id: "scen-1", companyId: "comp-1", name: "Base" };
    mockWhere.mockResolvedValueOnce([scenario]);

    const createdPlan = {
      id: "hc-new",
      scenarioId: "scen-1",
      departmentId: "dept-1",
      title: "Product Manager",
      count: 1,
      salary: "130000",
      benefitsRate: "0.25",
    };
    mockReturning.mockResolvedValue([createdPlan]);

    const req = jsonRequest("http://localhost/api/headcount", "POST", {
      scenarioId: "scen-1",
      departmentId: "dept-1",
      title: "Product Manager",
      count: 1,
      salary: 130000,
      startDate: "2026-01-01",
      benefitsRate: 0.25,
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("hc-new");
    expect(body.title).toBe("Product Manager");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockReturning).toHaveBeenCalled();
  });

  it("returns 403 for viewer", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = jsonRequest("http://localhost/api/headcount", "POST", {
      scenarioId: "scen-1",
      departmentId: "dept-1",
      title: "Should Not Create",
      salary: 100000,
      startDate: "2026-01-01",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
