import { NextResponse } from "next/server";
import { db, fundingRounds, getResolvedData, resolveEntities } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { parseDateRange } from "@/lib/date-validation";
import { getActiveScenario } from "@/lib/scenario-middleware";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeTotalRevenue,
  computeSubscriptionDetail,
  computeAllHeadcountCosts,
  computeAllMetrics,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type SubscriptionParams,
  type MetricsInput,
  type MonthlySeries,
  addSeries,
  subtractSeries,
  monthKey,
  D,
  dRound2,
} from "@burnless/engine";

/**
 * GET /api/metrics?startDate=2026-01&endDate=2026-12
 *
 * Returns all computed financial and SaaS metrics.
 * Scenario ID comes from the X-Scenario-Id header via getActiveScenario.
 */
export const GET = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "heavy");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = getActiveScenario(request);
  const startDateStr = url.searchParams.get("startDate") ?? "2026-01";
  const endDateStr = url.searchParams.get("endDate") ?? "2026-12";

  const dateRange = parseDateRange(startDateStr, endDateStr);
  if ("error" in dateRange) return errorResponse(dateRange.error, 400);
  const { periodStart, periodEnd } = dateRange;

  // Resolve all entity types (base + scenario overrides)
  const data = await getResolvedData(ctx.companyId, scenarioId);

  // Compute forecasts
  const forecastInputs: ForecastLineInput[] = data.forecastLines.map((fl) => ({
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
  const revInputs: RevenueStreamInput[] = data.revenueStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

  // Subscription details for SaaS metrics
  const subscriptionStreams = data.revenueStreams.filter((rs) => rs.type === "subscription");
  const subscriptionDetails = subscriptionStreams.flatMap((rs) =>
    computeSubscriptionDetail(
      (rs.parameters ?? {}) as unknown as SubscriptionParams,
      periodStart,
      periodEnd
    )
  );

  // Headcount
  const hcInputs: HeadcountPlanInput[] = data.headcountPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    employeeType: "full_time",
    count: hp.count,
    salary: Number(hp.salary),
    hourlyRate: null,
    hoursPerWeek: null,
    startDate: hp.startDate,
    endDate: hp.endDate,
    benefitsRate: Number(hp.benefitsRate),
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  // Aggregate by category
  const accountMap = new Map(data.financialAccounts.map((a) => [a.id, a]));
  let totalRevenue = new Map(revenueValues);
  let totalCogs: MonthlySeries = new Map();
  let totalOpex: MonthlySeries = new Map();
  let totalOtherIncome: MonthlySeries = new Map();
  let totalOtherExpense: MonthlySeries = new Map();

  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    switch (account.category) {
      case "revenue":
        totalRevenue = addSeries(totalRevenue, values);
        break;
      case "cogs":
        totalCogs = addSeries(totalCogs, values);
        break;
      case "operating_expense":
        totalOpex = addSeries(totalOpex, values);
        break;
      case "other_income":
        totalOtherIncome = addSeries(totalOtherIncome, values);
        break;
      case "other_expense":
        totalOtherExpense = addSeries(totalOtherExpense, values);
        break;
    }
  }

  // Add headcount to opex
  totalOpex = addSeries(totalOpex, headcountCosts.totalCost);

  const totalExpenses = addSeries(addSeries(totalCogs, totalOpex), totalOtherExpense);
  const netIncome = subtractSeries(addSeries(totalRevenue, totalOtherIncome), totalExpenses);

  // Funding rounds (resolved through scenario overlay)
  const fundingResolved = data.fundingRounds;
  const startingCash = fundingResolved
    .filter((r) => !r.isProjected && new Date(r.date) < periodStart)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const futureFunding: MonthlySeries = new Map();
  for (const r of fundingResolved) {
    const rDate = new Date(r.date);
    if (r.isProjected || rDate >= periodStart) {
      const key = monthKey(rDate);
      futureFunding.set(key, (futureFunding.get(key) ?? 0) + Number(r.amount));
    }
  }
  const cashPosition: MonthlySeries = new Map();
  let runningCash = D(startingCash);
  const sortedMonths = Array.from(netIncome.keys()).sort();
  for (const m of sortedMonths) {
    runningCash = runningCash.plus(netIncome.get(m) ?? 0).plus(futureFunding.get(m) ?? 0);
    cashPosition.set(m, dRound2(runningCash));
  }

  const metricsInput: MetricsInput = {
    revenue: totalRevenue,
    subscriptionDetails,
    totalExpenses,
    cogs: totalCogs,
    operatingExpenses: totalOpex,
    cashPosition,
    netIncome,
    headcount: headcountCosts.headcount,
  };

  const metrics = computeAllMetrics(metricsInput);

  return NextResponse.json({
    scenarioId: scenarioId ?? null,
    period: { start: startDateStr, end: endDateStr },
    metrics,
  });
});
