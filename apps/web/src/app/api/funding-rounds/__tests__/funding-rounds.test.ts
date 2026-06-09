/**
 * Tests for GET /api/funding-rounds and POST /api/funding-rounds.
 * Updated for overlay scenario system.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockSelect, mockFrom, mockWhere, mockResolveEntities, mockScenarioInsert } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockResolveEntities: vi.fn(),
  mockScenarioInsert: vi.fn(),
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
  fundingRounds: { companyId: "companyId", id: "id" },
  resolveEntities: mockResolveEntities,
  scenarioInsert: mockScenarioInsert,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gt: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const VALID_FUNDING_ROUND = {
  name: "Seed Round",
  // FUND-01: schema field renamed type -> roundType (route maps it to the DB `type` column).
  roundType: "seed" as const,
  amount: 1_000_000,
  date: "2026-06-01",
  preMoneyValuation: 5_000_000,
  dilutionPercent: 20,
  isProjected: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "owner" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe("GET /api/funding-rounds", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/funding-rounds", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns resolved funding rounds", async () => {
    const rows = [
      { id: "fr-1", name: "Seed", amount: "1000000" },
      { id: "fr-2", name: "Series A", amount: "5000000" },
    ];
    mockWhere.mockResolvedValue(rows);
    mockResolveEntities.mockResolvedValue(rows.map((r) => ({ ...r, _override: null })));

    const res = await GET(jsonRequest("http://localhost/api/funding-rounds", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(mockResolveEntities).toHaveBeenCalledWith("funding_round", rows, null);
  });
});

describe("POST /api/funding-rounds", () => {
  it("creates a funding round via scenarioInsert (201)", async () => {
    const created = { id: "fr-new", ...VALID_FUNDING_ROUND, companyId: "comp-1" };
    mockScenarioInsert.mockResolvedValue(created);

    const res = await POST(jsonRequest("http://localhost/api/funding-rounds", "POST", VALID_FUNDING_ROUND));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("fr-new");
    expect(mockScenarioInsert).toHaveBeenCalledWith(
      "funding_round", expect.anything(),
      expect.objectContaining({ name: "Seed Round", companyId: "comp-1" }),
      null,
      "comp-1",
    );
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await POST(jsonRequest("http://localhost/api/funding-rounds", "POST", VALID_FUNDING_ROUND));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid type", async () => {
    const invalid = { ...VALID_FUNDING_ROUND, roundType: "not_a_real_round" };
    const res = await POST(jsonRequest("http://localhost/api/funding-rounds", "POST", invalid));
    expect(res.status).toBe(400);
  });
});
