/**
 * Tests for GET /api/statements route.
 * Updated for overlay scenario system: uses getResolvedData and getActiveScenario.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

const { mockGetResolvedData } = vi.hoisted(() => ({
  mockGetResolvedData: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

const {
  mockComputeAllForecastLines,
  mockAggregateByAccount,
  mockComputeTotalRevenue,
  mockComputeAllHeadcountCosts,
  mockGenerateProfitAndLoss,
  mockGenerateCashFlow,
  mockGenerateBalanceSheet,
  mockMonthKey,
  mockAddSeries,
  mockComputeFundingImpact,
  mockMonthRange,
} = vi.hoisted(() => ({
  mockComputeAllForecastLines: vi.fn(),
  mockAggregateByAccount: vi.fn(),
  mockComputeTotalRevenue: vi.fn(),
  mockComputeAllHeadcountCosts: vi.fn(),
  mockGenerateProfitAndLoss: vi.fn(),
  mockGenerateCashFlow: vi.fn(),
  mockGenerateBalanceSheet: vi.fn(),
  mockMonthKey: vi.fn(),
  mockAddSeries: vi.fn(),
  mockComputeFundingImpact: vi.fn(),
  mockMonthRange: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) },
  forecastValues: { forecastLineId: "forecastLineId" },
  getResolvedData: mockGetResolvedData,
}));

vi.mock("drizzle-orm", () => ({ inArray: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/date-validation", () => ({
  parseDateRange: vi.fn().mockReturnValue({ periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") }),
}));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

vi.mock("@burnless/engine", async (importOriginal) => {
  // Pure Decimal/series helpers the route now uses at runtime (Phase 1 cash
  // model) get their REAL implementations — they have no DB/side effects, so
  // mocking them would only risk arithmetic drift. The compute fns stay mocked.
  const actual = await importOriginal<typeof import("@burnless/engine")>();
  return {
    computeAllForecastLines: mockComputeAllForecastLines,
    aggregateByAccount: mockAggregateByAccount,
    computeTotalRevenue: mockComputeTotalRevenue,
    computeAllHeadcountCosts: mockComputeAllHeadcountCosts,
    generateProfitAndLoss: mockGenerateProfitAndLoss,
    generateCashFlow: mockGenerateCashFlow,
    generateBalanceSheet: mockGenerateBalanceSheet,
    monthKey: mockMonthKey,
    addSeries: mockAddSeries,
    computeFundingImpact: mockComputeFundingImpact,
    monthRange: mockMonthRange,
    subtractSeries: actual.subtractSeries,
    dSum: actual.dSum,
    D: actual.D,
    dRound2: actual.dRound2,
  };
});

import { GET } from "../route";

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/statements");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function setupEmptyEngine() {
  mockComputeAllForecastLines.mockReturnValue(new Map());
  mockAggregateByAccount.mockReturnValue(new Map());
  mockComputeTotalRevenue.mockReturnValue(new Map());
  mockComputeAllHeadcountCosts.mockReturnValue({ totalCost: new Map(), headcount: new Map() });
  mockGenerateProfitAndLoss.mockReturnValue({
    revenue: { name: "Revenue", values: [], children: [] },
    // Phase 1: the route derives its netIncome series from pnl.netIncome.values.
    netIncome: { name: "Net Income", values: [], children: [] },
  });
  mockGenerateCashFlow.mockReturnValue({ operatingCashFlow: { name: "Operating", values: [], children: [] } });
  mockGenerateBalanceSheet.mockReturnValue({ assets: { name: "Assets", values: [], children: [] } });
  mockAddSeries.mockReturnValue(new Map());
  mockMonthRange.mockReturnValue([]);
  mockComputeFundingImpact.mockReturnValue({
    equityInflows: new Map(),
    debtInflows: new Map(),
    interestExpense: new Map(),
    principalPayments: new Map(),
    grantDisbursements: new Map(),
    warnings: [],
  });
}

function emptyResolvedData() {
  return {
    revenueStreams: [],
    headcountPlans: [],
    forecastLines: [],
    fundingRounds: [],
    departments: [],
    financialAccounts: [],
  };
}

describe("GET /api/statements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveScenario.mockReturnValue(null);
    mockGetResolvedData.mockResolvedValue(emptyResolvedData());
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with statements (no scenario)", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "viewer" });
    setupEmptyEngine();

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scenarioId).toBeNull();
    expect(body.profitAndLoss).toBeDefined();
    expect(body.cashFlow).toBeDefined();
    expect(body.balanceSheet).toBeDefined();
    expect(mockGetResolvedData).toHaveBeenCalledWith("company-1", null);
  });

  it("passes scenarioId from header to getResolvedData", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "viewer" });
    mockGetActiveScenario.mockReturnValue("scen-1");
    setupEmptyEngine();

    await GET(makeRequest());
    expect(mockGetResolvedData).toHaveBeenCalledWith("company-1", "scen-1");
  });

  it("uses default date range when not specified", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "viewer" });
    setupEmptyEngine();

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.period).toEqual({ start: "2026-01", end: "2026-12" });
  });

  it("passes headcount data through to response", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "company-1", role: "viewer" });
    mockGetResolvedData.mockResolvedValue({
      ...emptyResolvedData(),
      headcountPlans: [{
        id: "hc-1", departmentId: "dept-1", title: "Engineer", count: 3,
        salary: "120000", startDate: new Date("2026-01-01"), endDate: null, benefitsRate: "0.20",
        _override: null,
      }],
    });

    mockComputeAllForecastLines.mockReturnValue(new Map());
    mockAggregateByAccount.mockReturnValue(new Map());
    mockComputeTotalRevenue.mockReturnValue(new Map());
    mockAddSeries.mockReturnValue(new Map());

    const costMap = new Map([["2026-01", 30000], ["2026-02", 30000]]);
    const headcountMap = new Map([["2026-01", 3], ["2026-02", 3]]);
    mockComputeAllHeadcountCosts.mockReturnValue({ totalCost: costMap, headcount: headcountMap });
    mockGenerateProfitAndLoss.mockReturnValue({ netIncome: { name: "Net Income", values: [], children: [] } });
    mockGenerateCashFlow.mockReturnValue({});
    mockGenerateBalanceSheet.mockReturnValue({});

    const res = await GET(makeRequest({ startDate: "2026-01", endDate: "2026-02" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.headcount.totalCost).toEqual([["2026-01", 30000], ["2026-02", 30000]]);
    expect(body.headcount.totalHeadcount).toEqual([["2026-01", 3], ["2026-02", 3]]);
  });
});
