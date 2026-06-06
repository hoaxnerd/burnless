/**
 * Tests for PATCH/DELETE /api/headcount/[id]/salary-changes/[changeId].
 */
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
  mockUpdateSalaryChange,
  mockRemoveSalaryChange,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockUpdateSalaryChange: vi.fn(),
  mockRemoveSalaryChange: vi.fn(),
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
  headcountPlans: { id: "id", companyId: "companyId" },
  updateSalaryChange: mockUpdateSalaryChange,
  removeSalaryChange: mockRemoveSalaryChange,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
vi.mock("@burnless/types", () => ({ updateSalaryChangeSchema: { parse: (d: unknown) => d } }));

import { PATCH, DELETE } from "../[id]/salary-changes/[changeId]/route";

function makeParams(id: string, changeId: string) {
  return { params: Promise.resolve({ id, changeId }) };
}
function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "editor" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe("PATCH /api/headcount/[id]/salary-changes/[changeId]", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes/sc-1", "PATCH", { newSalary: 130000 }),
      makeParams("hc-1", "sc-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when parent headcount not found", async () => {
    mockWhere.mockResolvedValue([]);
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes/sc-1", "PATCH", { newSalary: 130000 }),
      makeParams("hc-1", "sc-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when updateSalaryChange returns null", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockUpdateSalaryChange.mockResolvedValue(null);
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes/sc-1", "PATCH", { newSalary: 130000 }),
      makeParams("hc-1", "sc-1"),
    );
    expect(res.status).toBe(404);
  });

  it("updates via updateSalaryChange and stringifies newSalary", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockUpdateSalaryChange.mockResolvedValue({ id: "sc-1", newSalary: "130000" });
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes/sc-1", "PATCH", { newSalary: 130000 }),
      makeParams("hc-1", "sc-1"),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateSalaryChange).toHaveBeenCalledWith(
      "sc-1",
      expect.objectContaining({ newSalary: "130000" }),
      null,
      "comp-1",
    );
  });
});

describe("DELETE /api/headcount/[id]/salary-changes/[changeId]", () => {
  beforeEach(() => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "admin" });
  });

  it("deletes via removeSalaryChange", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockRemoveSalaryChange.mockResolvedValue(true);
    const res = await DELETE(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes/sc-1", "DELETE"),
      makeParams("hc-1", "sc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(mockRemoveSalaryChange).toHaveBeenCalledWith("sc-1", null, "comp-1");
  });

  it("returns 403 for editor (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "editor" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(
      jsonRequest("http://localhost/api/headcount/hc-1/salary-changes/sc-1", "DELETE"),
      makeParams("hc-1", "sc-1"),
    );
    expect(res.status).toBe(403);
  });
});
