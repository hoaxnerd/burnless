import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockFindByIdForCompany,
  mockUpdateForCompany,
  mockDeleteForCompany,
} = vi.hoisted(() => ({
  mockFindByIdForCompany: vi.fn(),
  mockUpdateForCompany: vi.fn(),
  mockDeleteForCompany: vi.fn(),
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
  scenarios: {
    id: "id",
    companyId: "companyId",
    name: "name",
    type: "type",
    isDefault: "isDefault",
    isBudget: "isBudget",
    description: "description",
  },
  findByIdForCompany: mockFindByIdForCompany,
  updateForCompany: mockUpdateForCompany,
  deleteForCompany: mockDeleteForCompany,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditBatch: vi.fn() }));

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

describe("GET /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockFindByIdForCompany.mockResolvedValue(scenario);

    const req = jsonRequest("http://localhost/api/scenarios/scen-1", "GET");
    const res = await GET(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("scen-1");
    expect(body.name).toBe("Base Case");
    expect(mockFindByIdForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "scen-1",
      "comp-1"
    );
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "viewer",
    });
    mockFindByIdForCompany.mockResolvedValue(null);

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

describe("PATCH /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates scenario", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);

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
    mockUpdateForCompany.mockResolvedValue(null);

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
});

describe("DELETE /api/scenarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes scenario", async () => {
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
    };
    mockDeleteForCompany.mockResolvedValue(deletedScenario);

    const req = jsonRequest(
      "http://localhost/api/scenarios/scen-1",
      "DELETE"
    );
    const res = await DELETE(req, makeParams("scen-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(mockDeleteForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "scen-1",
      "comp-1"
    );
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);
    mockDeleteForCompany.mockResolvedValue(null);

    const req = jsonRequest(
      "http://localhost/api/scenarios/nonexistent",
      "DELETE"
    );
    const res = await DELETE(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Scenario not found");
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
    expect(mockDeleteForCompany).not.toHaveBeenCalled();
  });
});
