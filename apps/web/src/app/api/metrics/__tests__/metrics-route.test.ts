/**
 * Tests for GET /api/metrics route — validation and error handling.
 *
 * Mocks DB and auth to test the route handler's input validation,
 * error responses, and query parameter parsing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireCompanyAccess, mockErrorResponse } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockErrorResponse: vi.fn(async (msg: string, status: number) => {
    // Import NextResponse at call time
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ error: msg }, { status });
  }),
}));

// Mock api-helpers
vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  errorResponse: mockErrorResponse,
  withErrorHandler: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

// Mock DB — return minimal chain stubs
const _mockDbSelect = vi.fn();
const _mockDbFrom = vi.fn();
const _mockDbWhere = vi.fn();

vi.mock("@burnless/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) },
  scenarios: {},
  forecastLines: {},
  financialAccounts: {},
  revenueStreams: {},
  headcountPlans: {},
  transactions: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  sql: vi.fn(),
}));

// Mock engine functions to return empty results
vi.mock("@burnless/engine", () => ({
  computeAllForecastLines: vi.fn().mockReturnValue([]),
  aggregateByAccount: vi.fn().mockReturnValue(new Map()),
  computeTotalRevenue: vi.fn().mockReturnValue(new Map()),
  computeSubscriptionDetail: vi.fn().mockReturnValue([]),
  computeAllHeadcountCosts: vi.fn().mockReturnValue({
    totalCost: new Map(),
    headcount: new Map(),
  }),
  computeAllMetrics: vi.fn().mockReturnValue({
    cashPosition: 0,
    netBurnRate: 0,
    cashRunwayMonths: 0,
    mrr: 0,
  }),
  addSeries: vi.fn().mockReturnValue(new Map()),
  subtractSeries: vi.fn().mockReturnValue(new Map()),
  monthKey: vi.fn().mockReturnValue("2026-01"),
  emptySeries: vi.fn().mockReturnValue(new Map()),
}));

import { GET } from "../../metrics/route";

function getRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/metrics");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      const errorResp = new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
      mockRequireCompanyAccess.mockResolvedValue({ error: errorResp });

      const res = await GET(
        getRequest({ scenarioId: "test-scenario" })
      );

      expect(res!.status).toBe(401);
    });

    it("returns 403 when no company found", async () => {
      const errorResp = new Response(
        JSON.stringify({ error: "No company found" }),
        { status: 403 }
      );
      mockRequireCompanyAccess.mockResolvedValue({ error: errorResp });

      const res = await GET(
        getRequest({ scenarioId: "test-scenario" })
      );

      expect(res!.status).toBe(403);
    });
  });

  describe("input validation", () => {
    beforeEach(() => {
      mockRequireCompanyAccess.mockResolvedValue({
        userId: "user-1",
        companyId: "company-1",
        role: "owner",
      });
    });

    it("returns 400 when scenarioId is missing", async () => {
      const res = await GET(getRequest({}));
      expect(res!.status).toBe(400);
      const data = await res!.json();
      expect(data.error).toBe("scenarioId required");
    });
  });
});
