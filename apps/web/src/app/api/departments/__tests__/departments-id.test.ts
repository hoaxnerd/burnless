import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockUpdateForCompany, mockDeleteForCompany } = vi.hoisted(() => ({
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
  withErrorHandler: (fn: Function) => fn,
}));

vi.mock("@burnless/db", () => ({
  departments: {
    companyId: "companyId",
    id: "id",
    name: "name",
    parentId: "parentId",
  },
  updateForCompany: mockUpdateForCompany,
  deleteForCompany: mockDeleteForCompany,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditBatch: vi.fn() }));

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

describe("PATCH /api/departments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates department", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);

    const updatedDept = {
      id: "dept-1",
      companyId: "comp-1",
      name: "Updated Engineering",
      parentId: null,
    };
    mockUpdateForCompany.mockResolvedValue(updatedDept);

    const req = jsonRequest("http://localhost/api/departments/dept-1", "PATCH", {
      name: "Updated Engineering",
    });
    const res = await PATCH(req, makeParams("dept-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Updated Engineering");
    expect(mockUpdateForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "dept-1",
      "comp-1",
      { name: "Updated Engineering" }
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
      "http://localhost/api/departments/nonexistent",
      "PATCH",
      { name: "Does Not Exist" }
    );
    const res = await PATCH(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Department not found");
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

    const req = jsonRequest("http://localhost/api/departments/dept-1", "PATCH", {
      name: "Should Not Update",
    });
    const res = await PATCH(req, makeParams("dept-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockUpdateForCompany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/departments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes department", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const deletedDept = {
      id: "dept-1",
      companyId: "comp-1",
      name: "Engineering",
    };
    mockDeleteForCompany.mockResolvedValue(deletedDept);

    const req = jsonRequest("http://localhost/api/departments/dept-1", "DELETE");
    const res = await DELETE(req, makeParams("dept-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(mockDeleteForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "dept-1",
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
      "http://localhost/api/departments/nonexistent",
      "DELETE"
    );
    const res = await DELETE(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Department not found");
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

    const req = jsonRequest("http://localhost/api/departments/dept-1", "DELETE");
    const res = await DELETE(req, makeParams("dept-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockDeleteForCompany).not.toHaveBeenCalled();
  });
});
