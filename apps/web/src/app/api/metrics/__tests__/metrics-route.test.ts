/**
 * Tests for GET /api/metrics route — validation and error handling.
 *
 * Updated for overlay scenario system: uses getResolvedData and getActiveScenario.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireCompanyAccess, mockErrorResponse } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockErrorResponse: vi.fn(async (msg: string, status: number) => {
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ error: msg }, { status });
  }),
}));

const { mockGetResolvedData } = vi.hoisted(() => ({
  mockGetResolvedData: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  errorResponse: mockErrorResponse,
  withErrorHandler: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

vi.mock("@burnless/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) },
  fundingRounds: {},
  getResolvedData: mockGetResolvedData,
  resolveEntities: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("@burnless/engine", () => ({
  computeAllForecastLines: vi.fn().mockReturnValue([]),
  aggregateByAccount: vi.fn().mockReturnValue(new Map()),
  computeTotalRevenue: vi.fn().mockReturnValue(new Map()),
  computeSubscriptionDetail: vi.fn().mockReturnValue([]),
  computeAllHeadcountCosts: vi.fn().mockReturnValue({ totalCost: new Map(), headcount: new Map() }),
  computeAllMetrics: vi.fn().mockReturnValue({ cashPosition: 0, netBurnRate: 0, cashRunwayMonths: 0, mrr: 0 }),
  addSeries: vi.fn().mockReturnValue(new Map()),
  subtractSeries: vi.fn().mockReturnValue(new Map()),
  monthKey: vi.fn().mockReturnValue("2026-01"),
  D: vi.fn().mockReturnValue({ plus: vi.fn().mockReturnValue({ plus: vi.fn() }) }),
  dRound2: vi.fn().mockReturnValue(0),
}));

vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
vi.mock("@/lib/api-rate-limit", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/date-validation", () => ({
  parseDateRange: vi.fn().mockReturnValue({ periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") }),
}));

import { GET } from "../../metrics/route";

function getRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/metrics");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Request(url.toString());
}

describe("GET /api/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveScenario.mockReturnValue(null);
    mockGetResolvedData.mockResolvedValue({
      revenueStreams: [],
      headcountPlans: [],
      forecastLines: [],
      fundingRounds: [],
      departments: [],
      financialAccounts: [],
    });
  });

  it("returns 401 when not authenticated", async () => {
    const errorResp = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockRequireCompanyAccess.mockResolvedValue({ error: errorResp });

    const res = await GET(getRequest());
    expect(res!.status).toBe(401);
  });

  it("returns 403 when no company found", async () => {
    const errorResp = new Response(JSON.stringify({ error: "No company found" }), { status: 403 });
    mockRequireCompanyAccess.mockResolvedValue({ error: errorResp });

    const res = await GET(getRequest());
    expect(res!.status).toBe(403);
  });

  it("returns 200 with metrics when authenticated (no scenario)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "owner" });

    const res = await GET(getRequest());
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.scenarioId).toBeNull();
    expect(mockGetResolvedData).toHaveBeenCalledWith("company-1", null);
  });

  it("passes scenarioId from header to getResolvedData", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "owner" });
    mockGetActiveScenario.mockReturnValue("scen-1");

    await GET(getRequest());
    expect(mockGetResolvedData).toHaveBeenCalledWith("company-1", "scen-1");
  });

});
