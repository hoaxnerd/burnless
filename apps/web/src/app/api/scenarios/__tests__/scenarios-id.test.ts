import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockUpdateForCompany } = vi.hoisted(() => ({
  mockUpdateForCompany: vi.fn(),
}));

const {
  mockSelect,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectLimit,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
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
    update: mockUpdate,
  },
  scenarios: {
    id: "id",
    companyId: "companyId",
    name: "name",
    type: "type",
    isDefault: "isDefault",
    isBudget: "isBudget",
    description: "description",
    deletedAt: "deletedAt",
  },
  updateForCompany: mockUpdateForCompany,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditBatch: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));

import { GET, PATCH, DELETE } from "../[id]/route";

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

/* ─── GET /api/scenarios/[id] ─────────────────────────────── */

describe("GET /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: select chain for findScenario()
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = jsonRequest("http://localhost/api/scenarios/scen-1", "GET");
    const res = await GET(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns scenario by id", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });

    const scenario = {
      id: "scen-1",
      companyId: "comp-1",
      name: "Base Case",
      type: "base",
      isDefault: true,
      description: "Primary planning scenario",
    };
    mockSelectLimit.mockResolvedValue([scenario]);

    const req = jsonRequest("http://localhost/api/scenarios/scen-1", "GET");
    const res = await GET(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("scen-1");
    expect(body.name).toBe("Base Case");
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });
    mockSelectLimit.mockResolvedValue([]);

    const req = jsonRequest(
      "http://localhost/api/scenarios/nonexistent",
      "GET"
    );
    const res = await GET(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Scenario not found");
  });
});

/* ─── PATCH /api/scenarios/[id] ───────────────────────────── */

describe("PATCH /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: select chain for findScenario()
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = jsonRequest(
      "http://localhost/api/scenarios/scen-1",
      "PATCH",
      { name: "Should Not Update" }
    );
    const res = await PATCH(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockUpdateForCompany).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = jsonRequest(
      "http://localhost/api/scenarios/scen-1",
      "PATCH",
      { name: "Should Not Update" }
    );
    const res = await PATCH(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockUpdateForCompany).not.toHaveBeenCalled();
  });

  it("updates scenario", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);

    // findScenario returns existing
    mockSelectLimit.mockResolvedValue([{
      id: "scen-1",
      companyId: "comp-1",
      name: "Base Case",
      type: "base",
    }]);

    const updatedScenario = {
      id: "scen-1",
      companyId: "comp-1",
      name: "Updated Base",
      type: "base",
      isDefault: true,
      description: null,
    };
    mockUpdateForCompany.mockResolvedValue(updatedScenario);

    const req = jsonRequest(
      "http://localhost/api/scenarios/scen-1",
      "PATCH",
      { name: "Updated Base" }
    );
    const res = await PATCH(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Updated Base");
    expect(mockUpdateForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "scen-1",
      "comp-1",
      expect.objectContaining({ name: "Updated Base" })
    );
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);
    // findScenario returns empty
    mockSelectLimit.mockResolvedValue([]);

    const req = jsonRequest(
      "http://localhost/api/scenarios/nonexistent",
      "PATCH",
      { name: "Does Not Exist" }
    );
    const res = await PATCH(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Scenario not found");
  });

  it("sets budgetLockedAt when isBudget is true", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);

    // findScenario returns existing
    mockSelectLimit.mockResolvedValue([{
      id: "scen-1",
      companyId: "comp-1",
      name: "Budget Scenario",
    }]);

    const updatedScenario = {
      id: "scen-1",
      companyId: "comp-1",
      name: "Budget Scenario",
      isBudget: true,
      budgetLockedAt: new Date().toISOString(),
    };
    mockUpdateForCompany.mockResolvedValue(updatedScenario);

    const req = jsonRequest(
      "http://localhost/api/scenarios/scen-1",
      "PATCH",
      { isBudget: true }
    );
    const res = await PATCH(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isBudget).toBe(true);
    expect(mockUpdateForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "scen-1",
      "comp-1",
      expect.objectContaining({
        isBudget: true,
        budgetLockedAt: expect.any(Date),
      })
    );
  });
});

/* ─── DELETE /api/scenarios/[id] ──────────────────────────── */

describe("DELETE /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: update chain for soft-delete
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const req = jsonRequest(
      "http://localhost/api/scenarios/scen-1",
      "DELETE"
    );
    const res = await DELETE(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(mockUpdate).not.toHaveBeenCalled();
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

    const req = jsonRequest(
      "http://localhost/api/scenarios/scen-1",
      "DELETE"
    );
    const res = await DELETE(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes scenario", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const deletedScenario = {
      id: "scen-1",
      companyId: "comp-1",
      name: "Base Case",
      type: "base",
      deletedAt: new Date(),
    };
    mockUpdateReturning.mockResolvedValue([deletedScenario]);

    const req = jsonRequest(
      "http://localhost/api/scenarios/scen-1",
      "DELETE"
    );
    const res = await DELETE(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);
    mockUpdateReturning.mockResolvedValue([]);

    const req = jsonRequest(
      "http://localhost/api/scenarios/nonexistent",
      "DELETE"
    );
    const res = await DELETE(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Scenario not found");
  });
});
