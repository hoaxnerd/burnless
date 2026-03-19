import { NextResponse } from "next/server";
import { db, scenarios, forecastLines, financialAccounts, revenueStreams, headcountPlans, transactions } from "@burnless/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireCompanyAccess, errorResponse } from "@/lib/api-helpers";
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
  emptySeries,
} from "@burnless/engine";

/**
 * GET /api/metrics?scenarioId=xxx&startDate=2026-01&endDate=2026-12
 *
 * Returns all computed financial and SaaS metrics for a scenario.
 */
export async function GET(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = url.searchParams.get("scenarioId");
  const startDateStr = url.searchParams.get("startDate") ?? "2026-01";
  const endDateStr = url.searchParams.get("endDate") ?? "2026-12";

  if (!scenarioId) return errorResponse("scenarioId required", 400);

  const [scenario] = await db.select().from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, ctx.companyId)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const periodStart = new Date(startDateStr + "-01");
  const periodEnd = new Date(endDateStr + "-28");

  // Fetch all data
  const [fLines, accounts, revStreams, hcPlans] = await Promise.all([
    db.select().from(forecastLines).where(eq(forecastLines.scenarioId, scenarioId)),
    db.select().from(financialAccounts).where(eq(financialAccounts.companyId, ctx.companyId)),
    db.select().from(revenueStreams).where(eq(revenueStreams.scenarioId, scenarioId)),
    db.select().from(headcountPlans).where(eq(headcountPlans.scenarioId, scenarioId)),
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

  // Subscription details for SaaS metrics
  const subscriptionStreams = revStreams.filter((rs) => rs.type === "subscription");
  const subscriptionDetails = subscriptionStreams.flatMap((rs) =>
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
    }
  }

  // Add headcount to opex
  totalOpex = addSeries(totalOpex, headcountCosts.totalCost);

  const totalExpenses = addSeries(totalCogs, totalOpex);
  const netIncome = subtractSeries(totalRevenue, totalExpenses);

  // Cash position (simplified: cumulative net income)
  const cashPosition: MonthlySeries = new Map();
  let runningCash = 0;
  const sortedMonths = Array.from(netIncome.keys()).sort();
  for (const m of sortedMonths) {
    runningCash += netIncome.get(m) ?? 0;
    cashPosition.set(m, runningCash);
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
    scenario: { id: scenario.id, name: scenario.name },
    period: { start: startDateStr, end: endDateStr },
    metrics,
  });
}
