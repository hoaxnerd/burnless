/**
 * Tests for GET/PATCH/DELETE /api/accounts/[id].
 * Updated for overlay scenario system.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockFindByIdForCompany, mockScenarioUpdate, mockScenarioDelete } = vi.hoisted(() => ({
  mockFindByIdForCompany: vi.fn(),
  mockScenarioUpdate: vi.fn(),
  mockScenarioDelete: vi.fn(),
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
  financialAccounts: { companyId: "companyId", id: "id", sortOrder: "sortOrder" },
  findByIdForCompany: mockFindByIdForCompany,
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@burnless/types", () => ({ updateAccountSchema: { parse: (d: unknown) => d } }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { GET, PATCH, DELETE } from "../[id]/route";

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}
function makeParams(id: string) { return { params: Promise.resolve({ id }) }; }

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "editor" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
});

describe("GET /api/accounts/[id]", () => {
  it("returns account by id", async () => {
    const account = { id: "acc-1", name: "Revenue", type: "income", category: "revenue" };
    mockFindByIdForCompany.mockResolvedValue(account);
    const res = await GET(makeRequest("http://localhost/api/accounts/acc-1"), makeParams("acc-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("acc-1");
    expect(mockFindByIdForCompany).toHaveBeenCalledWith(expect.anything(), "acc-1", "company-1");
  });

  it("returns 404 when not found", async () => {
    mockFindByIdForCompany.mockResolvedValue(null);
    const res = await GET(makeRequest("http://localhost/api/accounts/nonexistent"), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/accounts/[id]", () => {
  it("updates via scenarioUpdate", async () => {
    mockScenarioUpdate.mockResolvedValue({ id: "acc-1", name: "Updated Revenue" });
    const res = await PATCH(
      makeRequest("http://localhost/api/accounts/acc-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Revenue" }),
      }),
      makeParams("acc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Revenue");
    expect(mockScenarioUpdate).toHaveBeenCalledWith(
      "financial_account", expect.anything(), "acc-1", { name: "Updated Revenue" }, null,
    );
  });

  it("returns 404 when not found", async () => {
    mockScenarioUpdate.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("http://localhost/api/accounts/nonexistent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      }),
      makeParams("nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await PATCH(
      makeRequest("http://localhost/api/accounts/acc-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      }),
      makeParams("acc-1"),
    );
    expect(res.status).toBe(403);
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/accounts/[id]", () => {
  beforeEach(() => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "admin" });
  });

  it("deletes via scenarioDelete", async () => {
    mockScenarioDelete.mockResolvedValue(undefined);
    const res = await DELETE(
      makeRequest("http://localhost/api/accounts/acc-1", { method: "DELETE" }),
      makeParams("acc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(mockScenarioDelete).toHaveBeenCalledWith("financial_account", expect.anything(), "acc-1", null);
  });

  it("returns 403 for editor role (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "editor" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(
      makeRequest("http://localhost/api/accounts/acc-1", { method: "DELETE" }),
      makeParams("acc-1"),
    );
    expect(res.status).toBe(403);
    expect(mockScenarioDelete).not.toHaveBeenCalled();
  });
});
