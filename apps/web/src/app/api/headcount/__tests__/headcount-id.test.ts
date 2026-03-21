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
  mockUpdate,
  mockSet,
  mockDelete,
  mockReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
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
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
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
  inArray: vi.fn(),
}));

import { PATCH, DELETE } from "../[id]/route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/headcount/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // companyScenarioIds subquery: db.select().from().where()
    const subqueryChain = { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue("subquery") }) };
    mockSelect.mockReturnValue(subqueryChain);

    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });
  });

  it("updates headcount plan", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);

    const updatedPlan = {
      id: "hc-1",
      scenarioId: "scen-1",
      departmentId: "dept-1",
      title: "Updated Title",
      count: 3,
      salary: "150000",
      benefitsRate: "0.30",
    };
    mockReturning.mockResolvedValue([updatedPlan]);

    const req = jsonRequest("http://localhost/api/headcount/hc-1", "PATCH", {
      title: "Updated Title",
      count: 3,
      salary: 150000,
      benefitsRate: 0.30,
    });
    const res = await PATCH(req, makeParams("hc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("Updated Title");
    expect(body.salary).toBe("150000");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);
    mockReturning.mockResolvedValue([]);

    const req = jsonRequest(
      "http://localhost/api/headcount/nonexistent",
      "PATCH",
      { title: "Does Not Exist" }
    );
    const res = await PATCH(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Headcount plan not found");
  });
});

describe("DELETE /api/headcount/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // companyScenarioIds subquery: db.select().from().where()
    const subqueryChain = { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue("subquery") }) };
    mockSelect.mockReturnValue(subqueryChain);

    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });
  });

  it("deletes headcount plan", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const deletedPlan = {
      id: "hc-1",
      scenarioId: "scen-1",
      title: "Senior Engineer",
    };
    mockReturning.mockResolvedValue([deletedPlan]);

    const req = jsonRequest("http://localhost/api/headcount/hc-1", "DELETE");
    const res = await DELETE(req, makeParams("hc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);
    mockReturning.mockResolvedValue([]);

    const req = jsonRequest(
      "http://localhost/api/headcount/nonexistent",
      "DELETE"
    );
    const res = await DELETE(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Headcount plan not found");
  });

  it("returns 403 for editor (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = jsonRequest("http://localhost/api/headcount/hc-1", "DELETE");
    const res = await DELETE(req, makeParams("hc-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
