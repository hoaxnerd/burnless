/**
 * Tests for PATCH/DELETE /api/forecast-lines/[id].
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
  forecastLines: { id: "id", companyId: "companyId" },
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));
vi.mock("@burnless/types", () => ({ updateForecastLineSchema: { parse: (d: unknown) => d } }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { PATCH, DELETE } from "../[id]/route";

function makeParams(id: string) { return { params: Promise.resolve({ id }) }; }
function makeRequest(url: string, opts?: RequestInit) { return new Request(url, opts); }

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ companyId: "c-1", userId: "u-1", role: "editor" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
});

describe("forecast-lines/[id] PATCH", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(
      makeRequest("http://localhost/api/forecast-lines/fl-1", { method: "PATCH", body: JSON.stringify({ method: "fixed" }) }),
      makeParams("fl-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when scenarioUpdate returns null", async () => {
    mockScenarioUpdate.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("http://localhost/api/forecast-lines/fl-1", { method: "PATCH", body: JSON.stringify({ method: "fixed" }) }),
      makeParams("fl-1"),
    );
    expect(res.status).toBe(404);
  });

  it("updates via scenarioUpdate on success", async () => {
    mockScenarioUpdate.mockResolvedValue({ id: "fl-1", method: "growth_rate" });
    const res = await PATCH(
      makeRequest("http://localhost/api/forecast-lines/fl-1", { method: "PATCH", body: JSON.stringify({ method: "growth_rate" }) }),
      makeParams("fl-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.method).toBe("growth_rate");
  });
});

describe("forecast-lines/[id] DELETE", () => {
  beforeEach(() => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "c-1", userId: "u-1", role: "admin" });
  });

  it("deletes via scenarioDelete", async () => {
    mockScenarioDelete.mockResolvedValue(undefined);
    const res = await DELETE(
      makeRequest("http://localhost/api/forecast-lines/fl-1", { method: "DELETE" }),
      makeParams("fl-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 403 for editor role (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "c-1", userId: "u-1", role: "editor" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(
      makeRequest("http://localhost/api/forecast-lines/fl-1", { method: "DELETE" }),
      makeParams("fl-1"),
    );
    expect(res.status).toBe(403);
  });
});
