/**
 * Tests for PATCH/DELETE /api/headcount/[id].
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
  headcountPlans: { id: "id", companyId: "companyId" },
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));
vi.mock("@burnless/types", () => ({ updateHeadcountSchema: { parse: (d: unknown) => d } }));
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

describe("PATCH /api/headcount/[id]", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(jsonRequest("http://localhost/api/headcount/hc-1", "PATCH", { title: "X" }), makeParams("hc-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when scenarioUpdate returns null", async () => {
    mockScenarioUpdate.mockResolvedValue(null);
    const res = await PATCH(jsonRequest("http://localhost/api/headcount/hc-1", "PATCH", { title: "X" }), makeParams("hc-1"));
    expect(res.status).toBe(404);
  });

  it("updates headcount plan via scenarioUpdate", async () => {
    mockScenarioUpdate.mockResolvedValue({ id: "hc-1", title: "Updated", salary: "150000" });
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1", "PATCH", { title: "Updated", salary: 150000, benefitsRate: 0.30 }),
      makeParams("hc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Updated");
    expect(mockScenarioUpdate).toHaveBeenCalledWith(
      "headcount_plan", expect.anything(), "hc-1",
      expect.objectContaining({ title: "Updated", salary: "150000", benefitsRate: "0.3" }),
      null,
    );
  });
});

describe("DELETE /api/headcount/[id]", () => {
  beforeEach(() => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "admin" });
  });

  it("deletes via scenarioDelete", async () => {
    mockScenarioDelete.mockResolvedValue(undefined);
    const res = await DELETE(jsonRequest("http://localhost/api/headcount/hc-1", "DELETE"), makeParams("hc-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(mockScenarioDelete).toHaveBeenCalledWith("headcount_plan", expect.anything(), "hc-1", null);
  });

  it("returns 403 for editor (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "editor" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(jsonRequest("http://localhost/api/headcount/hc-1", "DELETE"), makeParams("hc-1"));
    expect(res.status).toBe(403);
  });
});
