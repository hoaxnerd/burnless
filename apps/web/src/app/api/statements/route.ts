import { NextResponse } from "next/server";
import { db, forecastValues, getResolvedData } from "@burnless/db";
import { inArray } from "drizzle-orm";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { parseDateRange } from "@/lib/date-validation";
import { getActiveScenario } from "@/lib/scenario-middleware";
import {
  computeAllForecastLines,
  aggregateByAccount,
  computeTotalRevenue,
  computeAllHeadcountCosts,
  generateProfitAndLoss,
  generateCashFlow,
  generateBalanceSheet,
  computeFundingImpact,
  type ForecastLineInput,
  type RevenueStreamInput,
  type HeadcountPlanInput,
  type AccountData,
  addSeries,
  monthKey,
  monthRange,
} from "@burnless/engine";

/**
 * GET /api/statements?startDate=2026-01&endDate=2026-12
 *
 * Returns computed P&L, Cash Flow, and Balance Sheet.
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

  // Fetch forecast values for all forecast lines
  const lineIds = data.forecastLines.map((l) => l.id);
  const allValues = lineIds.length > 0
    ? await db.select().from(forecastValues).where(
        inArray(forecastValues.forecastLineId, lineIds)
      )
    : [];

  // Group override values by forecast line ID
  const overridesByLine = new Map<string, Map<string, number>>();
  for (const fv of allValues) {
    if (!fv.isOverride) continue;
    let lineOverrides = overridesByLine.get(fv.forecastLineId);
    if (!lineOverrides) {
      lineOverrides = new Map();
      overridesByLine.set(fv.forecastLineId, lineOverrides);
    }
    lineOverrides.set(monthKey(fv.month), Number(fv.amount));
  }

  // Build forecast line inputs
  const forecastInputs: ForecastLineInput[] = data.forecastLines.map((fl) => ({
    id: fl.id,
    accountId: fl.accountId,
    method: fl.method,
    parameters: (fl.parameters ?? {}) as Record<string, unknown>,
    startDate: fl.startDate,
    endDate: fl.endDate,
    overrides: overridesByLine.get(fl.id),
  }));

  // Compute forecast values
  const forecastResults = computeAllForecastLines(forecastInputs, periodStart, periodEnd);
  const accountForecasts = aggregateByAccount(forecastInputs, forecastResults);

  // Compute revenue from revenue streams
  const revInputs: RevenueStreamInput[] = data.revenueStreams.map((rs) => ({
    id: rs.id,
    name: rs.name,
    type: rs.type,
    parameters: (rs.parameters ?? {}) as Record<string, unknown>,
    startDate: rs.startDate,
    endDate: rs.endDate,
  }));
  const revenueValues = computeTotalRevenue(revInputs, periodStart, periodEnd);

  // Compute headcount costs
  const hcInputs: HeadcountPlanInput[] = data.headcountPlans.map((hp) => ({
    id: hp.id,
    departmentId: hp.departmentId,
    title: hp.title,
    name: hp.name ?? null,
    employeeType: hp.employeeType,
    count: Number(hp.count),
    salary: Number(hp.salary),
    hourlyRate: hp.hourlyRate == null ? null : Number(hp.hourlyRate),
    hoursPerWeek: hp.hoursPerWeek == null ? null : Number(hp.hoursPerWeek),
    startDate: hp.startDate,
    endDate: hp.endDate,
    benefitsRate: Number(hp.benefitsRate),
    benefitsBreakdown: (hp.parameters as { benefitsBreakdown?: HeadcountPlanInput["benefitsBreakdown"] } | null)?.benefitsBreakdown,
  }));
  const headcountCosts = computeAllHeadcountCosts(hcInputs, periodStart, periodEnd);

  // Build account data for statement generation
  const accounts = data.financialAccounts;
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

  // Phase 3 F §F6: route through computeFundingImpact (subsumes the legacy
  // fundingInflows Map). Mirrors the construction in compute-dashboard.ts.
  const funding = data.fundingRounds;
  const horizonMonths = monthRange(periodStart, periodEnd).map((d) => monthKey(d));
  const fundingImpact = computeFundingImpact({
    rounds: funding.map((r) => ({
      id: r.id,
      name: r.name,
      roundType: r.type as any, // DB enum matches FundingRoundType verbatim
      amount: Number(r.amount),
      date: (typeof r.date === "string" ? new Date(r.date) : r.date)
        .toISOString()
        .slice(0, 10),
      closeDate: r.closeDate
        ? (typeof r.closeDate === "string" ? new Date(r.closeDate) : r.closeDate)
            .toISOString()
            .slice(0, 10)
        : null,
      parameters: (r.parameters ?? {}) as any,
    })),
    months: horizonMonths,
    cumulativeQualifyingSpend: {},
  });

  // Generate statements
  const pnl = generateProfitAndLoss(accountDataList, {
    personnelBreakdown: { benefitsByComponent: headcountCosts.benefitsByComponent },
  });
  const cashFlow = generateCashFlow(
    accountDataList,
    0,
    /* fundingInflows */ undefined,
    /* workingCapital */ undefined,
    fundingImpact,
  );
  const balanceSheet = generateBalanceSheet(accountDataList);

  return NextResponse.json({
    scenarioId: scenarioId ?? null,
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
