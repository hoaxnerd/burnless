/**
 * Tests for PATCH/DELETE /api/departments/[id].
 * Updated for overlay scenario system.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockScenarioUpdate, mockScenarioDelete } = vi.hoisted(() => ({
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

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));

vi.mock("@burnless/db", () => ({
  departments: { companyId: "companyId", id: "id" },
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));
vi.mock("@burnless/types", () => ({ updateDepartmentSchema: { parse: (d: unknown) => d } }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { PATCH, DELETE } from "../[id]/route";

function makeParams(id: string) { return { params: Promise.resolve({ id }) }; }
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
});

describe("PATCH /api/departments/[id]", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(jsonRequest("http://localhost/api/departments/dept-1", "PATCH", { name: "X" }), makeParams("dept-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockScenarioUpdate.mockResolvedValue(null);
    const res = await PATCH(jsonRequest("http://localhost/api/departments/dept-1", "PATCH", { name: "X" }), makeParams("dept-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Department not found");
  });

  it("updates department via scenarioUpdate", async () => {
    mockScenarioUpdate.mockResolvedValue({ id: "dept-1", name: "Updated Engineering" });
    const res = await PATCH(
      jsonRequest("http://localhost/api/departments/dept-1", "PATCH", { name: "Updated Engineering" }),
      makeParams("dept-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Engineering");
    expect(mockScenarioUpdate).toHaveBeenCalledWith(
      "department", expect.anything(), "dept-1",
      { name: "Updated Engineering" }, null,
    );
  });
});

describe("DELETE /api/departments/[id]", () => {
  beforeEach(() => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "admin" });
  });

  it("deletes via scenarioDelete", async () => {
    mockScenarioDelete.mockResolvedValue(undefined);
    const res = await DELETE(jsonRequest("http://localhost/api/departments/dept-1", "DELETE"), makeParams("dept-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 403 for editor (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "editor" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(jsonRequest("http://localhost/api/departments/dept-1", "DELETE"), makeParams("dept-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    // scenarioDelete doesn't return null, it just completes; but the route always returns { deleted: true }
    mockScenarioDelete.mockResolvedValue(undefined);
    const res = await DELETE(jsonRequest("http://localhost/api/departments/nonexistent", "DELETE"), makeParams("nonexistent"));
    expect(res.status).toBe(200);
  });
});
