/**
 * Server-side dashboard computation — shared pipeline for computing all financial
 * data from a scenario. Used by overview, reports, and metrics pages.
 *
 * Uses React's cache() for request-level deduplication — multiple components
 * calling computeDashboardData with the same args in a single request
 * only trigger one computation.
 */
import { cache } from "react";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeRevenueStream,
  computeTotalRevenue,
  computeSubscriptionDetail,
  computeAllHeadcountCosts,
  computeAllMetrics,
  generateProfitAndLoss,
  generateCashFlow,
  generateBalanceSheet,
  computeFundingImpact,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type SubscriptionParams,
  type MetricsInput,
  type AccountData,
  type MonthlySeries,
  type ComputedMetrics,
  type ProfitAndLoss,
  type CashFlowStatement,
  type BalanceSheet,
  addSeries,
  subtractSeries,
  monthKey,
  monthRange,
  D,
  dRound2,
} from "@burnless/engine";
import {
  getAccounts,
  getForecastLines,
  getForecastValues,
  getRevenueStreams,
  getHeadcountPlans,
  getFundingRounds,
  getTransactions,
} from "./data";

export interface RevenueByType {
  subscriptionRevenue: MonthlySeries;
  oneTimeRevenue: MonthlySeries;
  usageRevenue: MonthlySeries;
  servicesRevenue: MonthlySeries;
  marketplaceRevenue: MonthlySeries;
  ecommerceRevenue: MonthlySeries;
  hardwareRevenue: MonthlySeries;
}

export interface DashboardData {
  metrics: ComputedMetrics;
  profitAndLoss: ProfitAndLoss;
  cashFlow: CashFlowStatement;
  balanceSheet: BalanceSheet;
  totalRevenue: MonthlySeries;
  revenueByType: RevenueByType;
  totalExpenses: MonthlySeries;
  totalCogs: MonthlySeries;
  totalOpex: MonthlySeries;
  netIncome: MonthlySeries;
  cashPosition: MonthlySeries;
  headcountSeries: MonthlySeries;
  headcountCostSeries: MonthlySeries;
  startingCash: number;
  hasData: boolean;
  periodStart: Date;
  periodEnd: Date;
  currentMonth: string;
}

/**
 * Cached dashboard computation — deduplicates within the same server request.
 * If multiple server components call this with the same (companyId, scenarioId),
 * the computation runs only once per request.
 */
export const computeDashboardData = cache(async function computeDashboardData(
  companyId: string,
  scenarioId: string,
  year?: number
): Promise<DashboardData> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const periodStart = new Date(targetYear, 0, 1);
  const periodEnd = new Date(targetYear, 11, 1);
  const currentMonth = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));

  const [accounts, fLines, revStreams, hcPlans, funding, txns] = await Promise.all([
    getAccounts(companyId),
    getForecastLines(scenarioId),
    getRevenueStreams(scenarioId),
    getHeadcountPlans(scenarioId),
    getFundingRounds(companyId),
    getTransactions(companyId),
  ]);

  // Phase 2 D §1.3: build structured funding inflows + impact for the new burn/runway
  // semantics and cash-flow children. Must be computed before metricsInput is assembled.
  const fundingInflows: MonthlySeries = new Map();
  for (const round of funding) {
    const roundDate = new Date(round.date);
    if (round.isProjected || roundDate >= periodStart) {
      const key = monthKey(roundDate);
      fundingInflows.set(key, (fundingInflows.get(key) ?? 0) + Number(round.amount));
    }
  }

  // Phase 2 D §1.3: compute structured funding impact for the new burn/runway semantics
  // and cash-flow children. Cumulative qualifying spend for grant match warnings is left
  // empty for v1 — a follow-up can derive it from transactions filtered by grant-specific
  // categories.
  const horizonMonths = monthRange(periodStart, periodEnd).map((d) => monthKey(d));
  const fundingImpact = computeFundingImpact({
    rounds: funding.map((r) => ({
      id: r.id,
      name: r.name,
      roundType: r.type as any, // DB enum matches FundingRoundType verbatim
      amount: Number(r.amount),
      date: (typeof r.date === "string" ? new Date(r.date) : r.date).toISOString().slice(0, 10),
      closeDate: r.closeDate
        ? (typeof r.closeDate === "string" ? new Date(r.closeDate) : r.closeDate).toISOString().slice(0, 10)
        : null,
      parameters: (r.parameters ?? {}) as any,
    })),
    months: horizonMonths,
    cumulativeQualifyingSpend: {},
  });

  // Fetch forecast value overrides
  const lineIds = fLines.map((l) => l.id);
  const allValues = await getForecastValues(lineIds);
  const overridesByLine = new Map<string, Map<string, number>>();
  for (const fv of allValues) {
    if (!fv.isOverride) continue;
    let lineOverrides = overridesByLine.get(fv.forecastLineId);
    if (!lineOverrides) {
      lineOverrides = new Map();
      overridesByLine.set(fv.forecastLineId, lineOverrides);
    }
    lineOverrides.set(monthKey(new Date(fv.month)), Number(fv.amount));
  }

  // Compute forecasts
  const forecastInputs: ForecastLineInput[] = fLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    method: fl.method,
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: new Date(fl.startDate),
    endDate: fl.endDate ? new Date(fl.endDate) : null,
    overrides: overridesByLine.get(fl.id),
  }));
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  // Revenue from streams
  const revInputs: RevenueStreamInput[] = revStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
    startDate: rs.startDate,
    endDate: rs.endDate,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

  // Per-type revenue mix (component metrics — keys match slugs in metric registry Task 6).
  const revenueByTypeRaw: Record<string, MonthlySeries> = {
    subscription: new Map(),
    one_time: new Map(),
    usage_based: new Map(),
    services: new Map(),
    marketplace: new Map(),
    ecommerce: new Map(),
    hardware: new Map(),
  };
  for (const stream of revInputs) {
    const series = computeRevenueStream(stream, periodStart, periodEnd);
    const existing = revenueByTypeRaw[stream.type] ?? new Map<string, number>();
    revenueByTypeRaw[stream.type] = addSeries(existing, series);
  }
  const revenueByType: RevenueByType = {
    subscriptionRevenue: revenueByTypeRaw.subscription!,
    oneTimeRevenue: revenueByTypeRaw.one_time!,
    usageRevenue: revenueByTypeRaw.usage_based!,
    servicesRevenue: revenueByTypeRaw.services!,
    marketplaceRevenue: revenueByTypeRaw.marketplace!,
    ecommerceRevenue: revenueByTypeRaw.ecommerce!,
    hardwareRevenue: revenueByTypeRaw.hardware!,
  };

  // Subscription details
  const subStreams = revStreams.filter((rs) => rs.type === "subscription");
  const subDetails = subStreams.flatMap((rs) =>
    computeSubscriptionDetail(
      (rs.parameters ?? {}) as unknown as SubscriptionParams,
      periodStart,
      periodEnd
    )
  );

  // Headcount
  const hcInputs: HeadcountPlanInput[] = hcPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    name: hp.name ?? null,
    employeeType: hp.employeeType,
    count: Number(hp.count),
    salary: Number(hp.salary),
    hourlyRate: hp.hourlyRate == null ? null : Number(hp.hourlyRate),
    hoursPerWeek: hp.hoursPerWeek == null ? null : Number(hp.hoursPerWeek),
    startDate: new Date(hp.startDate),
    endDate: hp.endDate ? new Date(hp.endDate) : null,
    benefitsRate: Number(hp.benefitsRate),
    benefitsBreakdown: (hp.parameters as { benefitsBreakdown?: HeadcountPlanInput["benefitsBreakdown"] } | null)?.benefitsBreakdown,
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  // Aggregate actual transactions by account (for COGS and other imported data)
  const actualsByAccount = new Map<string, MonthlySeries>();
  for (const txn of txns) {
    const txnDate = new Date(txn.date);
    if (txnDate < periodStart || txnDate > periodEnd) continue;
    const key = monthKey(txnDate);
    const existing = actualsByAccount.get(txn.accountId) ?? new Map();
    existing.set(key, (existing.get(key) ?? 0) + Number(txn.amount));
    actualsByAccount.set(txn.accountId, existing);
  }

  // Aggregate by category (forecasts + actuals)
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  let totalRevenue = new Map(revenueValues);
  let totalCogs: MonthlySeries = new Map();
  let totalOpex: MonthlySeries = new Map();
  let totalOtherIncome: MonthlySeries = new Map();
  let totalOtherExpense: MonthlySeries = new Map();

  const seenAccountIds = new Set<string>();
  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    seenAccountIds.add(accountId);
    if (account.category === "revenue") totalRevenue = addSeries(totalRevenue, values);
    else if (account.category === "cogs") totalCogs = addSeries(totalCogs, values);
    else if (account.category === "operating_expense") totalOpex = addSeries(totalOpex, values);
    else if (account.category === "other_income") totalOtherIncome = addSeries(totalOtherIncome, values);
    else if (account.category === "other_expense") totalOtherExpense = addSeries(totalOtherExpense, values);
  }
  // Include accounts that only have transaction data (no forecast lines)
  for (const [accountId, actuals] of actualsByAccount) {
    if (seenAccountIds.has(accountId)) continue;
    const account = accountMap.get(accountId);
    if (!account) continue;
    if (account.category === "revenue") totalRevenue = addSeries(totalRevenue, actuals);
    else if (account.category === "cogs") totalCogs = addSeries(totalCogs, actuals);
    else if (account.category === "operating_expense") totalOpex = addSeries(totalOpex, actuals);
    else if (account.category === "other_income") totalOtherIncome = addSeries(totalOtherIncome, actuals);
    else if (account.category === "other_expense") totalOtherExpense = addSeries(totalOtherExpense, actuals);
  }
  totalOpex = addSeries(totalOpex, headcountCosts.totalCost);
  const totalExpenses = addSeries(addSeries(totalCogs, totalOpex), totalOtherExpense);
  const netIncome = subtractSeries(addSeries(totalRevenue, totalOtherIncome), totalExpenses);

  // Expense-mix component series (Phase 1 §1.5 MANDATE) — per-month sums of
  // forecast-line values bucketed by method / isOneTime. These feed the
  // dashboard slugs `fixedExpenses` / `variableExpenses` /
  // `percentageDrivenExpenses` / `oneTimeExpenses` via extractMetricValue.
  let fixedExpensesSeries: MonthlySeries = new Map();
  let variableExpensesSeries: MonthlySeries = new Map();
  let percentageDrivenExpensesSeries: MonthlySeries = new Map();
  let oneTimeExpensesSeries: MonthlySeries = new Map();
  for (const fLine of fLines) {
    const account = accountMap.get(fLine.accountId);
    if (!account) continue;
    if (account.category !== "operating_expense" && account.category !== "cogs") continue;
    const values = forecastResults.get(fLine.id);
    if (!values) continue;
    if (fLine.method === "fixed") {
      fixedExpensesSeries = addSeries(fixedExpensesSeries, values);
    } else if (fLine.method === "growth_rate" || fLine.method === "per_unit") {
      variableExpensesSeries = addSeries(variableExpensesSeries, values);
    } else if (fLine.method === "percentage_of" || fLine.method === "custom_formula") {
      percentageDrivenExpensesSeries = addSeries(percentageDrivenExpensesSeries, values);
    }
    if ((fLine as { isOneTime?: boolean }).isOneTime) {
      oneTimeExpensesSeries = addSeries(oneTimeExpensesSeries, values);
    }
  }

  // Cash position — only include funding received on or before period start;
  // future/projected rounds are added when their month arrives
  const startingCash = funding
    .filter((r) => !r.isProjected && new Date(r.date) < periodStart)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const futureFunding: MonthlySeries = new Map();
  for (const r of funding) {
    const rDate = new Date(r.date);
    if (r.isProjected || rDate >= periodStart) {
      const key = monthKey(rDate);
      futureFunding.set(key, (futureFunding.get(key) ?? 0) + Number(r.amount));
    }
  }
  const cashPosition: MonthlySeries = new Map();
  let runningCash = D(startingCash);
  for (const m of Array.from(netIncome.keys()).sort()) {
    runningCash = runningCash.plus(netIncome.get(m) ?? 0).plus(futureFunding.get(m) ?? 0);
    cashPosition.set(m, dRound2(runningCash));
  }

  // Metrics
  const metricsInput: MetricsInput = {
    revenue: totalRevenue,
    subscriptionDetails: subDetails,
    totalExpenses,
    cogs: totalCogs,
    operatingExpenses: totalOpex,
    cashPosition,
    netIncome,
    headcount: headcountCosts.headcount,
    interestExpense: fundingImpact.interestExpense,
    principalPayments: fundingImpact.principalPayments,
  };
  const metrics = computeAllMetrics(metricsInput);

  // Surface non-ComputedMetrics series via slug so build-slot-metrics /
  // extractMetricValue can resolve them. The four expense-mix component slugs
  // come from forecast-line bucketing above; totalOpex is the sum series we
  // computed for the dashboard. Attached as Array<{month, value}> to match the
  // shape extractMetricValue expects (see metric-registry.ts).
  const attach = (slug: string, series: MonthlySeries) => {
    (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[slug] =
      Array.from(series.entries())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([month, value]) => ({ month, value }));
  };
  attach("totalOpex", totalOpex);
  attach("fixedExpenses", fixedExpensesSeries);
  attach("variableExpenses", variableExpensesSeries);
  attach("percentageDrivenExpenses", percentageDrivenExpensesSeries);
  attach("oneTimeExpenses", oneTimeExpensesSeries);

  // Financial statements — forecasts for accounts with forecast lines, actuals for the rest
  const accountDataList: AccountData[] = [];
  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    accountDataList.push({ id: account.id, name: account.name, category: account.category, values });
  }

  // Add accounts that only have transaction data (no forecast lines)
  for (const [accountId, actuals] of actualsByAccount) {
    if (seenAccountIds.has(accountId)) continue;
    const account = accountMap.get(accountId);
    if (!account) continue;
    accountDataList.push({ id: account.id, name: account.name, category: account.category, values: actuals });
  }

  // Add revenue from streams
  const revenueAccount = accounts.find((a) => a.category === "revenue" && a.isSystem);
  if (revenueValues.size > 0) {
    const existingRevIdx = accountDataList.findIndex((a) => a.category === "revenue");
    if (existingRevIdx >= 0) {
      accountDataList[existingRevIdx]!.values = addSeries(accountDataList[existingRevIdx]!.values, revenueValues);
    } else {
      accountDataList.push({
        id: revenueAccount?.id ?? "revenue-synthetic",
        name: "Revenue",
        category: "revenue",
        values: revenueValues,
      });
    }
  }

  // Add headcount costs
  if (headcountCosts.totalCost.size > 0) {
    accountDataList.push({
      id: "headcount-cost",
      name: "Personnel Costs",
      category: "operating_expense",
      values: headcountCosts.totalCost,
    });
  }

  const profitAndLoss = generateProfitAndLoss(accountDataList, {
    personnelBreakdown: { benefitsByComponent: headcountCosts.benefitsByComponent },
  });
  const cashFlow = generateCashFlow(accountDataList, startingCash, fundingInflows, undefined, fundingImpact);

  // Add derived balance sheet accounts so generateBalanceSheet has data.
  // Asset: Cash position (cumulative running balance, already computed above).
  // Equity: Retained Earnings (cumulative net income) + Paid-in Capital (initial + funding).
  const months = Array.from(netIncome.keys()).sort();
  if (months.length > 0) {
    accountDataList.push({ id: "bs-cash", name: "Cash & Equivalents", category: "asset", values: cashPosition });

    const retainedEarnings: MonthlySeries = new Map();
    let cumNI = 0;
    for (const m of months) {
      cumNI += netIncome.get(m) ?? 0;
      retainedEarnings.set(m, dRound2(D(cumNI)));
    }
    accountDataList.push({ id: "bs-retained-earnings", name: "Retained Earnings", category: "equity", values: retainedEarnings });

    const paidInCapital: MonthlySeries = new Map();
    let cumFunding = startingCash;
    for (const m of months) {
      cumFunding += fundingInflows.get(m) ?? 0;
      paidInCapital.set(m, dRound2(D(cumFunding)));
    }
    accountDataList.push({ id: "bs-paid-in-capital", name: "Paid-in Capital", category: "equity", values: paidInCapital });

    // Liability: Accounts Payable — approximate as 1 month of total expenses (Net-30 terms).
    const accountsPayable: MonthlySeries = new Map();
    for (const m of months) {
      accountsPayable.set(m, dRound2(D(totalExpenses.get(m) ?? 0)));
    }
    accountDataList.push({ id: "bs-accounts-payable", name: "Accounts Payable", category: "liability", values: accountsPayable });
  }

  const balanceSheet = generateBalanceSheet(accountDataList);

  const hasData = fLines.length > 0 || revStreams.length > 0 || hcPlans.length > 0;

  return {
    metrics,
    profitAndLoss,
    cashFlow,
    balanceSheet,
    totalRevenue,
    revenueByType,
    totalExpenses,
    totalCogs,
    totalOpex,
    netIncome,
    cashPosition,
    headcountSeries: headcountCosts.headcount,
    headcountCostSeries: headcountCosts.totalCost,
    startingCash,
    hasData,
    periodStart,
    periodEnd,
    currentMonth,
  };
});
