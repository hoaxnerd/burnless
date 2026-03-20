/**
 * Integration tests — full scenario flowing through all engine modules.
 *
 * Tests the end-to-end pipeline:
 *   Revenue streams + Headcount plans
 *   → Forecast lines
 *   → Financial statements (P&L, Cash Flow)
 *   → Metrics (SaaS, financial, growth)
 *
 * Uses realistic startup numbers to verify the modules compose correctly.
 */

import { describe, it, expect } from "vitest";
import {
  computeSubscriptionDetail,
  computeRevenueStream,
  computeTotalRevenue,
  type RevenueStreamInput,
  type SubscriptionParams,
} from "../revenue";
import {
  computeAllHeadcountCosts,
  type HeadcountPlanInput,
} from "../headcount";
import {
  generateProfitAndLoss,
  generateCashFlow,
  type AccountData,
} from "../statements";
import {
  computeAllMetrics,
  type MetricsInput,
} from "../metrics";
import {
  computeAllForecastLines,
  aggregateByAccount,
  type ForecastLineInput,
} from "../forecasting";
import {
  computeBudgetVsActuals,
  type AccountBudgetInput,
} from "../budget";
import { addSeries, round2, type MonthlySeries } from "../utils";

// ── Constants ────────────────────────────────────────────────────────────────

const START = new Date(2026, 0, 1); // Jan 2026
const END = new Date(2026, 5, 1);   // Jun 2026 (6 months)

// ── Full Scenario ────────────────────────────────────────────────────────────

describe("Integration: Full SaaS startup scenario", () => {
  // Step 1: Revenue
  const subParams: SubscriptionParams = {
    startingCustomers: 100,
    monthlyPrice: 99,
    newCustomersPerMonth: 15,
    monthlyChurnRate: 0.03,
    expansionRate: 0.01,
  };

  const subscriptionDetails = computeSubscriptionDetail(subParams, START, END);

  // Build revenue series from subscription details
  const subscriptionRevenue: MonthlySeries = new Map(
    subscriptionDetails.map((d) => [d.month, d.mrr])
  );

  // Add a services stream
  const servicesStream: RevenueStreamInput = {
    id: "consulting",
    name: "Consulting",
    type: "services",
    parameters: { hoursPerMonth: 40, hourlyRate: 150 },
  };
  const servicesRevenue = computeRevenueStream(servicesStream, START, END);

  const totalRevenue = addSeries(subscriptionRevenue, servicesRevenue);

  // Step 2: Headcount
  const headcountPlans: HeadcountPlanInput[] = [
    {
      id: "eng",
      departmentId: "engineering",
      title: "Engineers",
      count: 5,
      salary: 150000,
      startDate: START,
      endDate: null,
      benefitsRate: 0.25,
    },
    {
      id: "sales",
      departmentId: "sales",
      title: "Sales Reps",
      count: 2,
      salary: 90000,
      startDate: START,
      endDate: null,
      benefitsRate: 0.20,
    },
    {
      id: "ops",
      departmentId: "operations",
      title: "Ops Manager",
      count: 1,
      salary: 110000,
      startDate: new Date(2026, 2, 1), // starts March
      endDate: null,
      benefitsRate: 0.20,
    },
  ];

  const headcountResult = computeAllHeadcountCosts(headcountPlans, START, END);

  it("revenue: subscription details have 6 months", () => {
    expect(subscriptionDetails).toHaveLength(6);
    // Month 1: 100 customers, 3% churn = 3, 15 new → 112 end
    expect(subscriptionDetails[0]!.churnedCustomers).toBeCloseTo(3, 0);
    expect(subscriptionDetails[0]!.customers).toBeCloseTo(112, 0);
    // MRR month 1 should be positive
    expect(subscriptionDetails[0]!.mrr).toBeGreaterThan(0);
  });

  it("revenue: services revenue is constant", () => {
    // 40 * 150 = 6000 per month
    expect(servicesRevenue.get("2026-01")).toBe(6000);
    expect(servicesRevenue.get("2026-06")).toBe(6000);
  });

  it("revenue: total combines subscription + services", () => {
    const subJan = subscriptionRevenue.get("2026-01")!;
    expect(totalRevenue.get("2026-01")).toBe(subJan + 6000);
  });

  it("headcount: costs accumulate correctly", () => {
    // Jan: 5 eng × 150000/12 × 1.25 + 2 sales × 90000/12 × 1.20
    // Eng: 5 × 12500 × 1.25 = 78125
    // Sales: 2 × 7500 × 1.20 = 18000
    // Total Jan: 78125 + 18000 = 96125
    const janTotal = headcountResult.totalCost.get("2026-01")!;
    expect(janTotal).toBeCloseTo(96125, -1); // within $10

    // March adds ops manager: 110000/12 × 1.20 ≈ 11000
    const marTotal = headcountResult.totalCost.get("2026-03")!;
    expect(marTotal).toBeGreaterThan(janTotal);

    // Headcount: 7 in Jan/Feb, 8 from March
    expect(headcountResult.headcount.get("2026-01")).toBe(7);
    expect(headcountResult.headcount.get("2026-03")).toBe(8);
  });

  // Step 3: Build accounts for statements
  it("P&L: computes correct gross profit and net income", () => {
    const hostingCost: MonthlySeries = new Map();
    for (const [month, rev] of totalRevenue) {
      hostingCost.set(month, Math.round(rev * 0.15)); // 15% of revenue as COGS
    }

    const accounts: AccountData[] = [
      { id: "rev-sub", name: "Subscription Revenue", category: "revenue", values: subscriptionRevenue },
      { id: "rev-svc", name: "Consulting Revenue", category: "revenue", values: servicesRevenue },
      { id: "cogs-hosting", name: "Hosting", category: "cogs", values: hostingCost },
      { id: "opex-salary", name: "Salaries", category: "operating_expense", values: headcountResult.salaryCost },
      { id: "opex-benefits", name: "Benefits", category: "operating_expense", values: headcountResult.benefitsCost },
    ];

    const pnl = generateProfitAndLoss(accounts);

    // Revenue = subscription + services
    const janRev = pnl.revenue.values[0]!.value;
    expect(janRev).toBe(totalRevenue.get("2026-01"));

    // Gross profit = revenue - COGS (hosting)
    // Use round2 to match Decimal.js rounding in the engine
    const janGP = pnl.grossProfit.values[0]!.value;
    expect(janGP).toBe(round2(janRev - hostingCost.get("2026-01")!));

    // Gross margin should be around 85% (since COGS = 15%)
    expect(pnl.grossMargin[0]!.value).toBeCloseTo(85, 0);

    // Net income = revenue - all costs (should be negative for early startup)
    const janNetIncome = pnl.netIncome.values[0]!.value;
    const janCosts = hostingCost.get("2026-01")! +
      headcountResult.salaryCost.get("2026-01")! +
      headcountResult.benefitsCost.get("2026-01")!;
    expect(janNetIncome).toBe(janRev - janCosts);

    // Revenue children should include both streams
    expect(pnl.revenue.children).toHaveLength(2);
  });

  it("Cash Flow: starting cash + operating CF = ending cash", () => {
    const hostingCost: MonthlySeries = new Map();
    for (const [month, rev] of totalRevenue) {
      hostingCost.set(month, Math.round(rev * 0.15));
    }

    const accounts: AccountData[] = [
      { id: "rev-sub", name: "Subscription Revenue", category: "revenue", values: subscriptionRevenue },
      { id: "rev-svc", name: "Consulting Revenue", category: "revenue", values: servicesRevenue },
      { id: "cogs-hosting", name: "Hosting", category: "cogs", values: hostingCost },
      { id: "opex-salary", name: "Salaries", category: "operating_expense", values: headcountResult.salaryCost },
      { id: "opex-benefits", name: "Benefits", category: "operating_expense", values: headcountResult.benefitsCost },
    ];

    const startingCash = 500000;
    const cf = generateCashFlow(accounts, startingCash);

    // Ending cash month 1 = starting cash + operating CF (no investing/financing)
    const opCF = cf.operatingCashFlow.values[0]!.value;
    expect(cf.endingCash[0]!.value).toBe(startingCash + opCF);

    // Cash should be declining (we're burning) or growing slowly
    // Month 2 ending cash = Month 1 ending + Month 2 net change
    // Use round2 to match Decimal.js internal rounding
    const month2Change = cf.netCashChange.values[1]!.value;
    expect(cf.endingCash[1]!.value).toBe(round2(cf.endingCash[0]!.value + month2Change));
  });

  it("Metrics: computed from aggregated financials are consistent", () => {
    const hostingCost: MonthlySeries = new Map();
    for (const [month, rev] of totalRevenue) {
      hostingCost.set(month, Math.round(rev * 0.15));
    }

    // Build metrics input from the scenario
    const totalExpenses: MonthlySeries = new Map();
    for (const month of totalRevenue.keys()) {
      totalExpenses.set(
        month,
        (hostingCost.get(month) ?? 0) +
        (headcountResult.salaryCost.get(month) ?? 0) +
        (headcountResult.benefitsCost.get(month) ?? 0)
      );
    }

    const netIncome: MonthlySeries = new Map();
    for (const month of totalRevenue.keys()) {
      netIncome.set(month, (totalRevenue.get(month) ?? 0) - (totalExpenses.get(month) ?? 0));
    }

    let runningCash = 500000;
    const cashPosition: MonthlySeries = new Map();
    for (const month of Array.from(totalRevenue.keys()).sort()) {
      runningCash += netIncome.get(month) ?? 0;
      cashPosition.set(month, runningCash);
    }

    const metricsInput: MetricsInput = {
      revenue: totalRevenue,
      subscriptionDetails: subscriptionDetails,
      totalExpenses,
      cogs: hostingCost,
      operatingExpenses: new Map(
        Array.from(totalRevenue.keys()).map((m) => [
          m,
          (headcountResult.salaryCost.get(m) ?? 0) + (headcountResult.benefitsCost.get(m) ?? 0),
        ])
      ),
      cashPosition,
      netIncome,
      headcount: headcountResult.headcount,
    };

    const m = computeAllMetrics(metricsInput);

    // MRR should come from subscription details
    expect(m.mrr[0]!.value).toBe(subscriptionDetails[0]!.mrr);

    // ARR = MRR × 12 (use round2 to match Decimal.js)
    expect(m.arr[0]!.value).toBe(round2(m.mrr[0]!.value * 12));

    // Gross profit = revenue - COGS
    const janRev = totalRevenue.get("2026-01")!;
    const janCOGS = hostingCost.get("2026-01")!;
    expect(m.grossProfit[0]!.value).toBe(round2(janRev - janCOGS));

    // Gross margin ≈ 85%
    expect(m.grossMarginPercent[0]!.value).toBeCloseTo(85, 0);

    // Headcount from plan
    expect(m.revenuePerEmployee[0]!.value).toBeGreaterThan(0);

    // Revenue should be growing (subscription growth + constant services)
    expect(m.revenueGrowthRate[1]!.value).toBeGreaterThan(0);

    // SaaS Quick Ratio should be defined
    expect(m.saasQuickRatio[0]!.value).toBeGreaterThan(0);

    // Customer metrics should match subscription details
    expect(m.totalCustomers[0]!.value).toBe(subscriptionDetails[0]!.customers);
    expect(m.newCustomersPerMonth[0]!.value).toBe(subscriptionDetails[0]!.newCustomers);

    // ARPA = MRR / customers
    const expectedArpa = subscriptionDetails[0]!.mrr / subscriptionDetails[0]!.customers;
    expect(m.arpa[0]!.value).toBeCloseTo(expectedArpa, 0);

    // All 6 months should have data
    expect(m.mrr).toHaveLength(6);
    expect(m.grossProfit).toHaveLength(6);
    expect(m.netBurnRate).toHaveLength(6);
  });
});

// ── Forecasting → Statements Integration ─────────────────────────────────────

describe("Integration: Forecast lines → P&L statements", () => {
  it("forecast lines aggregate into correct P&L", () => {
    const lines: ForecastLineInput[] = [
      {
        id: "rev-saas",
        accountId: "revenue",
        method: "growth_rate",
        parameters: { baseAmount: 50000, monthlyGrowthRate: 0.05 },
        startDate: START,
        endDate: null,
      },
      {
        id: "cogs-hosting",
        accountId: "cogs",
        method: "percentage_of",
        parameters: { sourceLineId: "rev-saas", percentage: 0.20 },
        startDate: START,
        endDate: null,
      },
      {
        id: "opex-team",
        accountId: "operating_expense",
        method: "fixed",
        parameters: { amount: 80000 },
        startDate: START,
        endDate: null,
      },
    ];

    const lineValues = computeAllForecastLines(lines, START, END);
    const byAccount = aggregateByAccount(lines, lineValues);

    // Build P&L accounts from forecast
    const accounts: AccountData[] = [
      { id: "rev", name: "SaaS Revenue", category: "revenue", values: byAccount.get("revenue")! },
      { id: "cogs", name: "Hosting", category: "cogs", values: byAccount.get("cogs")! },
      { id: "opex", name: "Team Cost", category: "operating_expense", values: byAccount.get("operating_expense")! },
    ];

    const pnl = generateProfitAndLoss(accounts);

    // Month 1: revenue = 50000, COGS = 10000 (20%), OpEx = 80000
    expect(pnl.revenue.values[0]!.value).toBe(50000);
    expect(pnl.cogs.values[0]!.value).toBe(10000);
    expect(pnl.grossProfit.values[0]!.value).toBe(40000);
    expect(pnl.operatingIncome.values[0]!.value).toBe(-40000); // 40000 - 80000

    // Month 2: revenue = 52500, COGS = 10500
    expect(pnl.revenue.values[1]!.value).toBe(52500);
    expect(pnl.cogs.values[1]!.value).toBe(10500);
    expect(pnl.grossProfit.values[1]!.value).toBe(42000);

    // Gross margin should be 80% throughout (COGS = 20%)
    expect(pnl.grossMargin[0]!.value).toBe(80);
    expect(pnl.grossMargin[1]!.value).toBe(80);
  });
});

// ── Budget vs Actuals Integration ────────────────────────────────────────────

describe("Integration: Forecast → Budget vs Actuals", () => {
  it("compares forecast (budget) against actuals", () => {
    // Budget from forecast
    const budgetRevenue: MonthlySeries = new Map([
      ["2026-01", 50000],
      ["2026-02", 55000],
      ["2026-03", 60000],
    ]);
    const budgetExpenses: MonthlySeries = new Map([
      ["2026-01", 40000],
      ["2026-02", 42000],
      ["2026-03", 44000],
    ]);

    // Actuals (slightly different)
    const actualRevenue: MonthlySeries = new Map([
      ["2026-01", 52000],  // beat budget
      ["2026-02", 53000],  // missed budget
      ["2026-03", 62000],  // beat budget
    ]);
    const actualExpenses: MonthlySeries = new Map([
      ["2026-01", 38000],  // under budget (good)
      ["2026-02", 45000],  // over budget (bad)
      ["2026-03", 43000],  // under budget (good)
    ]);

    const budgetInputs: AccountBudgetInput[] = [
      {
        accountId: "rev",
        accountName: "Revenue",
        category: "revenue",
        isRevenue: true,
        budgetValues: budgetRevenue,
        actualValues: actualRevenue,
      },
      {
        accountId: "exp",
        accountName: "Expenses",
        category: "operating_expense",
        isRevenue: false,
        budgetValues: budgetExpenses,
        actualValues: actualExpenses,
      },
    ];

    const bva = computeBudgetVsActuals(budgetInputs);

    // Revenue line
    const revLine = bva.lineItems.find((l) => l.accountId === "rev")!;
    // Jan: 52000 - 50000 = +2000 (favorable for revenue)
    expect(revLine.variance[0]!.value).toBe(2000);
    expect(revLine.favorable[0]!.value).toBe(true);
    // Feb: 53000 - 55000 = -2000 (unfavorable)
    expect(revLine.variance[1]!.value).toBe(-2000);
    expect(revLine.favorable[1]!.value).toBe(false);
    // Variance %: -2000/55000 * 100 ≈ -3.64%
    expect(revLine.variancePercent[1]!.value).toBeCloseTo(-3.64, 1);

    // Expense line
    const expLine = bva.lineItems.find((l) => l.accountId === "exp")!;
    // Jan: 38000 - 40000 = -2000 (favorable for expenses)
    expect(expLine.variance[0]!.value).toBe(-2000);
    expect(expLine.favorable[0]!.value).toBe(true);
    // Feb: 45000 - 42000 = +3000 (unfavorable for expenses)
    expect(expLine.variance[1]!.value).toBe(3000);
    expect(expLine.favorable[1]!.value).toBe(false);
  });
});
