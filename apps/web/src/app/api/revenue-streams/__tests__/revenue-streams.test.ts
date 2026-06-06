/**
 * Tests for GET /api/revenue-streams and POST /api/revenue-streams.
 *
 * Updated for the overlay scenario system:
 * - GET fetches base entities by companyId, then resolves via resolveEntities
 * - POST uses scenarioInsert to route to base or override
 * - scenarioId comes from header via getActiveScenario
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
  mockResolveEntities,
  mockScenarioInsert,
} = vi.hoisted(() => ({
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
    try {
      const body = await req.json();
      return { data: schema.parse(body) };
    } catch {
      return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) };
    }
  },
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect },
  revenueStreams: { companyId: "companyId", id: "id" },
  resolveEntities: mockResolveEntities,
  scenarioInsert: mockScenarioInsert,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gt: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({
  getActiveScenario: mockGetActiveScenario,
}));

const { mockValidateTiers } = vi.hoisted(() => ({
  mockValidateTiers: vi.fn(),
}));

vi.mock("@/lib/revenue-params", () => ({
  validateTiers: mockValidateTiers,
}));

vi.mock("@burnless/engine", () => ({}));

import { GET, POST } from "../route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({
    userId: "user-1", companyId: "comp-1", role: "owner",
  });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockValidateTiers.mockReturnValue(undefined); // passes by default

  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe("GET /api/revenue-streams", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(jsonRequest("http://localhost/api/revenue-streams", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns resolved revenue streams (no scenario)", async () => {
    const base = [
      { id: "rs-1", name: "SaaS", type: "subscription" },
      { id: "rs-2", name: "Consulting", type: "services" },
    ];
    mockWhere.mockResolvedValue(base);
    mockResolveEntities.mockResolvedValue(
      base.map((e) => ({ ...e, _override: null }))
    );

    const res = await GET(jsonRequest("http://localhost/api/revenue-streams", "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(mockResolveEntities).toHaveBeenCalledWith("revenue_stream", base, null);
  });

  it("passes scenarioId from header to resolveEntities", async () => {
    mockGetActiveScenario.mockReturnValue("scen-1");
    const base = [{ id: "rs-1", name: "SaaS", type: "subscription" }];
    mockWhere.mockResolvedValue(base);
    mockResolveEntities.mockResolvedValue(
      base.map((e) => ({ ...e, _override: null }))
    );

    await GET(jsonRequest("http://localhost/api/revenue-streams", "GET"));
    expect(mockResolveEntities).toHaveBeenCalledWith("revenue_stream", base, "scen-1");
  });

});

describe("POST /api/revenue-streams", () => {
  it("creates a revenue stream via scenarioInsert (201)", async () => {
    const created = { id: "rs-new", name: "SaaS Subscriptions", type: "subscription", companyId: "comp-1" };
    mockScenarioInsert.mockResolvedValue(created);

    const res = await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", {
        name: "SaaS Subscriptions",
        type: "subscription",
        startDate: "2026-01-01",
        parameters: { price: 49 },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("rs-new");
    expect(mockScenarioInsert).toHaveBeenCalledWith(
      "revenue_stream",
      expect.anything(),
      expect.objectContaining({ name: "SaaS Subscriptions", companyId: "comp-1" }),
      null,
      "comp-1",
    );
  });

  it("passes scenarioId from header to scenarioInsert", async () => {
    mockGetActiveScenario.mockReturnValue("scen-1");
    mockScenarioInsert.mockResolvedValue({ id: "rs-new" });

    await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", {
        name: "Test",
        type: "subscription",
        startDate: "2026-01-01",
      }),
    );
    expect(mockScenarioInsert).toHaveBeenCalledWith(
      "revenue_stream",
      expect.anything(),
      expect.anything(),
      "scen-1",
      "comp-1",
    );
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", {
        name: "Test", type: "subscription", startDate: "2026-01-01",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects POST missing startDate with 400", async () => {
    const res = await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", {
        name: "Test",
        type: "subscription",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a marketplace stream with valid startDate (201)", async () => {
    const created = { id: "rs-mp", name: "Market", type: "marketplace", companyId: "comp-1" };
    mockScenarioInsert.mockResolvedValue(created);

    const res = await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", {
        name: "Market",
        type: "marketplace",
        startDate: "2026-01-01",
        parameters: { gmv: 50000, takeRate: 0.05 },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("rs-mp");
  });

  it("returns 400 for POST with invalid (overlapping) tiers", async () => {
    mockValidateTiers.mockImplementationOnce(() => {
      throw new Error("Tiers must be in ascending order by minUnits.");
    });
    const res = await POST(
      jsonRequest("http://localhost/api/revenue-streams", "POST", {
        name: "Tiered",
        type: "usage_based",
        startDate: "2026-01-01",
        parameters: {
          tiers: [
            { name: "High", minUnits: 100, maxUnits: null, pricePerUnit: 0.5 },
            { name: "Low", minUnits: 0, maxUnits: 99, pricePerUnit: 1 },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});
