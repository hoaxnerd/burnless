import { NextResponse } from "next/server";
import { db, scenarios, forecastLines, financialAccounts, revenueStreams, headcountPlans, fundingRounds } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeTotalRevenue,
  computeAllHeadcountCosts,
  compareScenarios,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type ScenarioData,
  type MonthlySeries,
  addSeries,
  subtractSeries,
  monthKey,
} from "@burnless/engine";

/**
 * GET /api/scenarios/compare?baseId=xxx&compareId=yyy
 */
export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const baseId = url.searchParams.get("baseId");
  const compareId = url.searchParams.get("compareId");

  if (!baseId || !compareId) return errorResponse("baseId and compareId required", 400);

  const [baseScenario, compareScenario] = await Promise.all([
    db.select().from(scenarios).where(and(eq(scenarios.id, baseId), eq(scenarios.companyId, ctx.companyId))).then((r) => r[0]),
    db.select().from(scenarios).where(and(eq(scenarios.id, compareId), eq(scenarios.companyId, ctx.companyId))).then((r) => r[0]),
  ]);

  if (!baseScenario || !compareScenario) return errorResponse("Scenario not found", 404);

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), 0, 1);
  const periodEnd = new Date(now.getFullYear(), 11, 1);

  const [baseData, compareData] = await Promise.all([
    buildScenarioData(baseScenario.id, baseScenario.name, ctx.companyId, periodStart, periodEnd),
    buildScenarioData(compareScenario.id, compareScenario.name, ctx.companyId, periodStart, periodEnd),
  ]);

  const result = compareScenarios(baseData, compareData);

  // Convert to serializable format
  return NextResponse.json({
    baseScenario: result.baseScenario,
    compareScenario: result.compareScenario,
    lines: [
      { name: "Revenue", ...serializeComparison(result.revenue) },
      { name: "Expenses", ...serializeComparison(result.expenses) },
      { name: "Net Income", ...serializeComparison(result.netIncome) },
      { name: "Cash Position", ...serializeComparison(result.cashPosition) },
      { name: "Headcount", ...serializeComparison(result.headcount) },
    ],
  });
});

async function buildScenarioData(
  scenarioId: string,
  name: string,
  companyId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ScenarioData> {
  const [fLines, accounts, revStreams, hcPlans, funding] = await Promise.all([
    db.select().from(forecastLines).where(eq(forecastLines.scenarioId, scenarioId)),
    db.select().from(financialAccounts).where(eq(financialAccounts.companyId, companyId)),
    db.select().from(revenueStreams).where(eq(revenueStreams.scenarioId, scenarioId)),
    db.select().from(headcountPlans).where(eq(headcountPlans.scenarioId, scenarioId)),
    db.select().from(fundingRounds).where(eq(fundingRounds.companyId, companyId)),
  ]);

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

  const revInputs: RevenueStreamInput[] = revStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

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

  const startingCash = funding.reduce((sum, r) => sum + Number(r.amount), 0);
  const cashPosition: MonthlySeries = new Map();
  let runningCash = startingCash;
  for (const m of Array.from(netIncome.keys()).sort()) {
    runningCash += netIncome.get(m) ?? 0;
    cashPosition.set(m, runningCash);
  }

  return {
    id: scenarioId,
    name,
    accounts: accountForecasts,
    aggregates: {
      revenue: totalRevenue,
      expenses: totalExpenses,
      netIncome,
      cashPosition,
      headcount: headcountCosts.headcount,
    },
  };
}

function serializeComparison(line: {
  baseValues: { month: string; value: number }[];
  compareValues: { month: string; value: number }[];
  deltaAbsolute: { month: string; value: number }[];
  deltaPercent: { month: string; value: number }[];
}) {
  return {
    baseValues: line.baseValues,
    compareValues: line.compareValues,
    deltaAbsolute: line.deltaAbsolute,
    deltaPercent: line.deltaPercent,
  };
}
