import { NextResponse } from "next/server";
import { db, scenarios, forecastLines, forecastValues, financialAccounts, revenueStreams, headcountPlans, fundingRounds } from "@burnless/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { parseDateRange } from "@/lib/date-validation";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeTotalRevenue,
  computeAllHeadcountCosts,
  generateProfitAndLoss,
  generateCashFlow,
  generateBalanceSheet,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type AccountData,
  type MonthlySeries,
  monthKey,
  addSeries,
} from "@burnless/engine";

/**
 * GET /api/statements?scenarioId=xxx&startDate=2026-01&endDate=2026-12
 *
 * Returns computed P&L, Cash Flow, and Balance Sheet for a scenario.
 */
export const GET = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "heavy");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = url.searchParams.get("scenarioId");
  const startDateStr = url.searchParams.get("startDate") ?? "2026-01";
  const endDateStr = url.searchParams.get("endDate") ?? "2026-12";

  if (!scenarioId) return errorResponse("scenarioId required", 400);

  // Verify scenario ownership
  const [scenario] = await db.select().from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)));
  if (!scenario) return errorResponse("Scenario not found", 404);

  const dateRange = parseDateRange(startDateStr, endDateStr);
  if ("error" in dateRange) return errorResponse(dateRange.error, 400);
  const { periodStart, periodEnd } = dateRange;

  // Fetch all data in parallel
  const [fLines, accounts, revStreams, hcPlans, funding] = await Promise.all([
    db.select().from(forecastLines).where(eq(forecastLines.scenarioId, scenarioId)),
    db.select().from(financialAccounts).where(eq(financialAccounts.companyId, ctx.companyId)),
    db.select().from(revenueStreams).where(eq(revenueStreams.scenarioId, scenarioId)),
    db.select().from(headcountPlans).where(eq(headcountPlans.scenarioId, scenarioId)),
    db.select().from(fundingRounds).where(eq(fundingRounds.companyId, ctx.companyId)),
  ]);

  // Fetch forecast values for all lines
  const lineIds = fLines.map((l) => l.id);
  const _allValues = lineIds.length > 0
    ? await db.select().from(forecastValues).where(
        inArray(forecastValues.forecastLineId, lineIds)
      )
    : [];

  // Build forecast line inputs
  const forecastInputs: ForecastLineInput[] = fLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    method: fl.method,
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: fl.startDate,
    endDate: fl.endDate,
  }));

  // Compute forecast values
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  // Compute revenue from revenue streams
  const revInputs: RevenueStreamInput[] = revStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

  // Compute headcount costs
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

  // Build account data for statement generation
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const accountDataList: AccountData[] = [];

  // Add forecast-based accounts
  for (const [accountId, values] of accountForecasts) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    accountDataList.push({
      id: account.id,
      name: account.name,
      category: account.category,
      values,
    });
  }

  // Add revenue from streams (merge into any existing revenue account or create synthetic)
  const revenueAccount = accounts.find((a) => a.category === "revenue" && a.isSystem);
  if (revenueValues.size > 0) {
    const existingRevIdx = accountDataList.findIndex((a) => a.category === "revenue");
    if (existingRevIdx >= 0) {
      accountDataList[existingRevIdx]!.values = addSeries(
        accountDataList[existingRevIdx]!.values,
        revenueValues
      );
    } else {
      accountDataList.push({
        id: revenueAccount?.id ?? "revenue-synthetic",
        name: "Revenue",
        category: "revenue",
        values: revenueValues,
      });
    }
  }

  // Add headcount costs as operating expense
  if (headcountCosts.totalCost.size > 0) {
    accountDataList.push({
      id: "headcount-cost",
      name: "Personnel Costs",
      category: "operating_expense",
      values: headcountCosts.totalCost,
    });
  }

  // Compute funding inflows
  const fundingInflows: MonthlySeries = new Map();
  for (const round of funding) {
    if (round.isProjected || round.date >= periodStart) {
      const key = monthKey(round.date);
      fundingInflows.set(key, (fundingInflows.get(key) ?? 0) + Number(round.amount));
    }
  }

  // Generate statements
  const pnl = generateProfitAndLoss(accountDataList);
  const cashFlow = generateCashFlow(accountDataList, 0, fundingInflows);
  const balanceSheet = generateBalanceSheet(accountDataList);

  return NextResponse.json({
    scenario: { id: scenario.id, name: scenario.name, type: scenario.type },
    period: { start: startDateStr, end: endDateStr },
    profitAndLoss: pnl,
    cashFlow,
    balanceSheet,
    headcount: {
      totalCost: Array.from(headcountCosts.totalCost.entries()).sort(([a], [b]) => a.localeCompare(b)),
      totalHeadcount: Array.from(headcountCosts.headcount.entries()).sort(([a], [b]) => a.localeCompare(b)),
    },
  });
});
