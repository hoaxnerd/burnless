/**
 * Tests for PATCH/DELETE /api/headcount/[id]/bonuses/[bonusId].
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
  mockUpdateBonus,
  mockRemoveBonus,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockUpdateBonus: vi.fn(),
  mockRemoveBonus: vi.fn(),
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
  updateBonus: mockUpdateBonus,
  removeBonus: mockRemoveBonus,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
vi.mock("@burnless/types", () => ({ updateBonusSchema: { parse: (d: unknown) => d } }));

import { PATCH, DELETE } from "../[id]/bonuses/[bonusId]/route";

function makeParams(id: string, bonusId: string) {
  return { params: Promise.resolve({ id, bonusId }) };
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

describe("PATCH /api/headcount/[id]/bonuses/[bonusId]", () => {
  it("returns 401 when not authorized", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses/b-1", "PATCH", { amount: 6000 }),
      makeParams("hc-1", "b-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when parent headcount not found", async () => {
    mockWhere.mockResolvedValue([]);
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses/b-1", "PATCH", { amount: 6000 }),
      makeParams("hc-1", "b-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when updateBonus returns null", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockUpdateBonus.mockResolvedValue(null);
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses/b-1", "PATCH", { amount: 6000 }),
      makeParams("hc-1", "b-1"),
    );
    expect(res.status).toBe(404);
  });

  it("updates via updateBonus and stringifies amount", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockUpdateBonus.mockResolvedValue({ id: "b-1", amount: "6000" });
    const res = await PATCH(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses/b-1", "PATCH", { amount: 6000 }),
      makeParams("hc-1", "b-1"),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateBonus).toHaveBeenCalledWith(
      "b-1",
      expect.objectContaining({ amount: "6000" }),
      null,
      "comp-1",
    );
  });
});

describe("DELETE /api/headcount/[id]/bonuses/[bonusId]", () => {
  beforeEach(() => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "admin" });
  });

  it("deletes via removeBonus", async () => {
    mockWhere.mockResolvedValue([{ id: "hc-1" }]);
    mockRemoveBonus.mockResolvedValue(true);
    const res = await DELETE(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses/b-1", "DELETE"),
      makeParams("hc-1", "b-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(mockRemoveBonus).toHaveBeenCalledWith("b-1", null, "comp-1");
  });

  it("returns 403 for editor (requires admin)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ companyId: "comp-1", userId: "user-1", role: "editor" });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(
      jsonRequest("http://localhost/api/headcount/hc-1/bonuses/b-1", "DELETE"),
      makeParams("hc-1", "b-1"),
    );
    expect(res.status).toBe(403);
  });
});
