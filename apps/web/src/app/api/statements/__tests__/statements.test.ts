import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
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
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

/**
 * DB mock with sequential results.
 * Statements route query order:
 *   0: scenario ownership check
 *   1-5: Promise.all (forecastLines, accounts, revenueStreams, headcountPlans, fundingRounds)
 *   6: forecastValues (conditional)
 */
let dbResults: unknown[];
let dbResultIdx: number;

function nextDbResult() {
  return dbResults[dbResultIdx++] ?? [];
}

vi.mock("@burnless/db", () => {
  const makeChain = (): Record<string, (...args: unknown[]) => unknown> => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    const self = () => chain;
    chain.from = self;
    chain.where = self;
    chain.limit = self;
    chain.orderBy = self;
    chain.then = (...args: unknown[]) => (args[0] as (v: unknown) => unknown)(nextDbResult());
    return chain;
  };

  return {
    db: { select: () => makeChain() },
    scenarios: { id: "id", companyId: "companyId" },
    forecastLines: { scenarioId: "scenarioId", id: "id" },
    forecastValues: { forecastLineId: "forecastLineId" },
    financialAccounts: { companyId: "companyId", id: "id", category: "category", isSystem: "isSystem" },
    revenueStreams: { scenarioId: "scenarioId" },
    headcountPlans: { scenarioId: "scenarioId" },
    fundingRounds: { companyId: "companyId" },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("@burnless/engine", () => ({
  computeAllForecastLines: mockComputeAllForecastLines,
  aggregateByAccount: mockAggregateByAccount,
  computeTotalRevenue: mockComputeTotalRevenue,
  computeAllHeadcountCosts: mockComputeAllHeadcountCosts,
  generateProfitAndLoss: mockGenerateProfitAndLoss,
  generateCashFlow: mockGenerateCashFlow,
  generateBalanceSheet: mockGenerateBalanceSheet,
  monthKey: mockMonthKey,
  addSeries: mockAddSeries,
}));

import { GET } from "../route";

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/statements");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

/** Default engine mocks for empty data */
function setupEmptyEngine() {
  mockComputeAllForecastLines.mockReturnValue(new Map());
  mockAggregateByAccount.mockReturnValue(new Map());
  mockComputeTotalRevenue.mockReturnValue(new Map());
  mockComputeAllHeadcountCosts.mockReturnValue({
    totalCost: new Map(),
    headcount: new Map(),
  });
  mockGenerateProfitAndLoss.mockReturnValue({
    revenue: { name: "Revenue", values: [], children: [] },
    netIncome: { name: "Net Income", values: [], children: [] },
  });
  mockGenerateCashFlow.mockReturnValue({
    operatingCashFlow: { name: "Operating", values: [], children: [] },
    netCashChange: { name: "Net Cash", values: [], children: [] },
  });
  mockGenerateBalanceSheet.mockReturnValue({
    assets: { name: "Assets", values: [], children: [] },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/statements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbResults = [];
    dbResultIdx = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(makeRequest({ scenarioId: "s-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when scenarioId is missing", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("scenarioId required");
  });

  it("returns 404 when scenario not found", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });
    dbResults = [[]]; // scenario not found

    const res = await GET(makeRequest({ scenarioId: "nonexistent" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Scenario not found");
  });

  it("returns financial statements for valid scenario", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });

    dbResults = [
      [{ id: "s-1", name: "Base Scenario", type: "base", companyId: "company-1" }], // scenario
      [], // forecastLines
      [], // accounts
      [], // revenueStreams
      [], // headcountPlans
      [], // fundingRounds
    ];
    setupEmptyEngine();

    const res = await GET(makeRequest({
      scenarioId: "s-1", startDate: "2026-01", endDate: "2026-06",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scenario).toEqual({ id: "s-1", name: "Base Scenario", type: "base" });
    expect(body.period).toEqual({ start: "2026-01", end: "2026-06" });
    expect(body.profitAndLoss).toBeDefined();
    expect(body.cashFlow).toBeDefined();
    expect(body.balanceSheet).toBeDefined();
    expect(body.headcount).toBeDefined();
    expect(body.headcount.totalCost).toEqual([]);
    expect(body.headcount.totalHeadcount).toEqual([]);
  });

  it("uses default date range when not specified", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });
    dbResults = [
      [{ id: "s-1", name: "Base", type: "base", companyId: "company-1" }],
      [], [], [], [], [],
    ];
    setupEmptyEngine();

    const res = await GET(makeRequest({ scenarioId: "s-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.period).toEqual({ start: "2026-01", end: "2026-12" });
  });

  it("passes headcount data through to response", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "viewer",
    });

    dbResults = [
      [{ id: "s-1", name: "Growth", type: "projection", companyId: "company-1" }],
      [], // forecastLines
      [], // accounts
      [], // revenueStreams
      [{ id: "hc-1", departmentId: "dept-1", title: "Engineer", count: 3, salary: "120000", startDate: new Date("2026-01-01"), endDate: null, benefitsRate: "0.20" }],
      [], // fundingRounds
    ];

    mockComputeAllForecastLines.mockReturnValue(new Map());
    mockAggregateByAccount.mockReturnValue(new Map());
    mockComputeTotalRevenue.mockReturnValue(new Map());

    const costMap = new Map([["2026-01", 30000], ["2026-02", 30000]]);
    const headcountMap = new Map([["2026-01", 3], ["2026-02", 3]]);
    mockComputeAllHeadcountCosts.mockReturnValue({
      totalCost: costMap,
      headcount: headcountMap,
    });
    mockGenerateProfitAndLoss.mockReturnValue({});
    mockGenerateCashFlow.mockReturnValue({});
    mockGenerateBalanceSheet.mockReturnValue({});

    const res = await GET(makeRequest({ scenarioId: "s-1", startDate: "2026-01", endDate: "2026-02" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.headcount.totalCost).toEqual([["2026-01", 30000], ["2026-02", 30000]]);
    expect(body.headcount.totalHeadcount).toEqual([["2026-01", 3], ["2026-02", 3]]);
  });

  it("calls engine functions with correct parameters", async () => {
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1", companyId: "company-1", role: "editor",
    });

    dbResults = [
      [{ id: "s-1", name: "Test", type: "base", companyId: "company-1" }],
      [{ id: "fl-1", accountId: "acc-1", method: "fixed", parameters: { amount: 5000 }, startDate: new Date("2026-01-01"), endDate: new Date("2026-06-30") }],
      [], // accounts
      [{ id: "rs-1", name: "SaaS Revenue", type: "subscription", parameters: { monthlyPrice: 99 } }],
      [], // headcountPlans
      [], // fundingRounds
      [], // forecastValues for line fl-1
    ];

    setupEmptyEngine();

    const res = await GET(makeRequest({ scenarioId: "s-1", startDate: "2026-01", endDate: "2026-06" }));

    expect(res.status).toBe(200);
    expect(mockComputeAllForecastLines).toHaveBeenCalledOnce();
    expect(mockAggregateByAccount).toHaveBeenCalledOnce();
    expect(mockComputeTotalRevenue).toHaveBeenCalledOnce();
    expect(mockComputeAllHeadcountCosts).toHaveBeenCalledOnce();
    expect(mockGenerateProfitAndLoss).toHaveBeenCalledOnce();
    expect(mockGenerateCashFlow).toHaveBeenCalledOnce();
    expect(mockGenerateBalanceSheet).toHaveBeenCalledOnce();
  });
});
