/**
 * Server-side dashboard computation — shared pipeline for computing all financial
 * data from a scenario. Used by overview, reports, and metrics pages.
 */
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeTotalRevenue,
  computeSubscriptionDetail,
  computeAllHeadcountCosts,
  computeAllMetrics,
  generateProfitAndLoss,
  generateCashFlow,
  generateBalanceSheet,
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
} from "@burnless/engine";
import {
  getAccounts,
  getForecastLines,
  getRevenueStreams,
  getHeadcountPlans,
  getFundingRounds,
} from "./data";

export interface DashboardData {
  metrics: ComputedMetrics;
  profitAndLoss: ProfitAndLoss;
  cashFlow: CashFlowStatement;
  balanceSheet: BalanceSheet;
  totalRevenue: MonthlySeries;
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

export async function computeDashboardData(
  companyId: string,
  scenarioId: string,
  year?: number
): Promise<DashboardData> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const periodStart = new Date(targetYear, 0, 1);
  const periodEnd = new Date(targetYear, 11, 1);
  const currentMonth = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));

  const [accounts, fLines, revStreams, hcPlans, funding] = await Promise.all([
    getAccounts(companyId),
    getForecastLines(scenarioId),
    getRevenueStreams(scenarioId),
    getHeadcountPlans(scenarioId),
    getFundingRounds(companyId),
  ]);

  // Compute forecasts
  const forecastInputs: ForecastLineInput[] = fLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    method: fl.method,
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: fl.startDate,
    endDate: fl.endDate,
  }));
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  // Revenue from streams
  const revInputs: RevenueStreamInput[] = revStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

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
    count: hp.count,
    salary: Number(hp.salary),
    startDate: hp.startDate,
    endDate: hp.endDate,
    benefitsRate: Number(hp.benefitsRate),
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  // Aggregate by category
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  let totalRevenue = new Map(revenueValues);
  let totalCogs: MonthlySeries = new Map();
  let totalOpex: MonthlySeries = new Map();

  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    if (account.category === "revenue") totalRevenue = addSeries(totalRevenue, values);
    else if (account.category === "cogs") totalCogs = addSeries(totalCogs, values);
    else if (account.category === "operating_expense") totalOpex = addSeries(totalOpex, values);
  }
  totalOpex = addSeries(totalOpex, headcountCosts.totalCost);
  const totalExpenses = addSeries(totalCogs, totalOpex);
  const netIncome = subtractSeries(totalRevenue, totalExpenses);

  // Cash position
  const startingCash = funding.reduce((sum, r) => sum + Number(r.amount), 0);
  const cashPosition: MonthlySeries = new Map();
  let runningCash = startingCash;
  for (const m of Array.from(netIncome.keys()).sort()) {
    runningCash += netIncome.get(m) ?? 0;
    cashPosition.set(m, runningCash);
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
  };
  const metrics = computeAllMetrics(metricsInput);

  // Financial statements
  const accountDataList: AccountData[] = [];
  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    accountDataList.push({ id: account.id, name: account.name, category: account.category, values });
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

  const fundingInflows: MonthlySeries = new Map();
  for (const round of funding) {
    if (round.isProjected || round.date >= periodStart) {
      const key = monthKey(round.date);
      fundingInflows.set(key, (fundingInflows.get(key) ?? 0) + Number(round.amount));
    }
  }

  const profitAndLoss = generateProfitAndLoss(accountDataList);
  const cashFlow = generateCashFlow(accountDataList, startingCash, fundingInflows);
  const balanceSheet = generateBalanceSheet(accountDataList);

  const hasData = fLines.length > 0 || revStreams.length > 0 || hcPlans.length > 0;

  return {
    metrics,
    profitAndLoss,
    cashFlow,
    balanceSheet,
    totalRevenue,
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
}
