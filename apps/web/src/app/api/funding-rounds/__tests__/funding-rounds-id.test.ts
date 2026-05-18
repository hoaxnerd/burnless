/**
 * Tests for PATCH/DELETE /api/funding-rounds/[id].
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
  fundingRounds: { id: "id", companyId: "companyId" },
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));
vi.mock("@burnless/types", () => ({ updateFundingRoundSchema: { parse: (d: unknown) => d } }));
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

describe("funding-rounds/[id] PATCH", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "PATCH", body: JSON.stringify({ name: "Series A" }) }),
      makeParams("fr-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockScenarioUpdate.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "PATCH", body: JSON.stringify({ name: "X" }) }),
      makeParams("fr-1"),
    );
    expect(res.status).toBe(404);
  });

  it("updates via scenarioUpdate on success", async () => {
    mockScenarioUpdate.mockResolvedValue({ id: "fr-1", name: "Series A" });
    const res = await PATCH(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "PATCH", body: JSON.stringify({ name: "Series A" }) }),
      makeParams("fr-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Series A");
  });

  it("Phase 2 D: parameters/closeDate/notes reach scenarioUpdate (not silently dropped)", async () => {
    // This test guards against regression of the silent-strip bug where Zod's
    // default strip behaviour dropped Phase 2 D fields before the route plumbed them.
    const payload = {
      parameters: { valuationCap: 5000000, discountRate: 0.2 },
      closeDate: "2026-06-30",
      notes: "Expected to close Q2.",
    };
    mockScenarioUpdate.mockResolvedValue({ id: "fr-2", ...payload });
    const res = await PATCH(
      makeRequest("http://localhost/api/funding-rounds/fr-2", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
      makeParams("fr-2"),
    );
    expect(res.status).toBe(200);
    // Verify scenarioUpdate received the three Phase 2 D fields in its changes argument.
    const [, , , changes] = mockScenarioUpdate.mock.calls[0] as [unknown, unknown, unknown, Record<string, unknown>];
    expect(changes.parameters).toEqual(payload.parameters);
    expect(changes.notes).toBe(payload.notes);
    // closeDate is coerced to a Date object in the route.
    expect(changes.closeDate).toBeInstanceOf(Date);
    expect((changes.closeDate as Date).toISOString().startsWith("2026-06-30")).toBe(true);
  });
});

describe("funding-rounds/[id] DELETE", () => {
  beforeEach(() => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "c-1", userId: "u-1", role: "admin" });
  });

  it("deletes via scenarioDelete", async () => {
    mockScenarioDelete.mockResolvedValue(undefined);
    const res = await DELETE(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "DELETE" }),
      makeParams("fr-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 403 for editor role (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "c-1", userId: "u-1", role: "editor" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(
      makeRequest("http://localhost/api/funding-rounds/fr-1", { method: "DELETE" }),
      makeParams("fr-1"),
    );
    expect(res.status).toBe(403);
  });
});
