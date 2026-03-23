import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockFindByIdForCompany, mockUpdateForCompany, mockDeleteForCompany } =
  vi.hoisted(() => ({
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
  financialAccounts: {
    companyId: "companyId",
    id: "id",
    name: "name",
    type: "type",
    category: "category",
    sortOrder: "sortOrder",
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

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/accounts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns account by id", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "viewer",
    });

    const account = {
      id: "acc-1",
      companyId: "company-1",
      name: "Revenue",
      type: "income",
      category: "revenue",
      parentId: null,
      isSystem: false,
      sortOrder: 0,
    };
    mockFindByIdForCompany.mockResolvedValue(account);

    const req = makeRequest("http://localhost/api/accounts/acc-1");
    const res = await GET(req, makeParams("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("acc-1");
    expect(body.name).toBe("Revenue");
    expect(mockFindByIdForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      "company-1"
    );
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "viewer",
    });
    mockFindByIdForCompany.mockResolvedValue(null);

    const req = makeRequest("http://localhost/api/accounts/nonexistent");
    const res = await GET(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Account not found");
  });
});

describe("PATCH /api/accounts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates account", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);

    const updatedAccount = {
      id: "acc-1",
      companyId: "company-1",
      name: "Updated Revenue",
      type: "income",
      category: "revenue",
      parentId: null,
      isSystem: false,
      sortOrder: 0,
    };
    mockUpdateForCompany.mockResolvedValue(updatedAccount);

    const req = makeRequest("http://localhost/api/accounts/acc-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Revenue" }),
    });
    const res = await PATCH(req, makeParams("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Updated Revenue");
    expect(mockUpdateForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      "company-1",
      { name: "Updated Revenue" }
    );
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);
    mockUpdateForCompany.mockResolvedValue(null);

    const req = makeRequest("http://localhost/api/accounts/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Does Not Exist" }),
    });
    const res = await PATCH(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Account not found");
  });

  it("returns 403 for viewer role", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "viewer",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = makeRequest("http://localhost/api/accounts/acc-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Should Not Update" }),
    });
    const res = await PATCH(req, makeParams("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockUpdateForCompany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/accounts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes account", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);

    const deletedAccount = {
      id: "acc-1",
      companyId: "company-1",
      name: "Revenue",
      type: "income",
      category: "revenue",
    };
    mockDeleteForCompany.mockResolvedValue(deletedAccount);

    const req = makeRequest("http://localhost/api/accounts/acc-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(mockDeleteForCompany).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      "company-1"
    );
  });

  it("returns 404 when not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);
    mockDeleteForCompany.mockResolvedValue(null);

    const req = makeRequest("http://localhost/api/accounts/nonexistent", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("nonexistent"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Account not found");
  });

  it("returns 403 for editor role (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "company-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = makeRequest("http://localhost/api/accounts/acc-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("acc-1"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockDeleteForCompany).not.toHaveBeenCalled();
  });
});
