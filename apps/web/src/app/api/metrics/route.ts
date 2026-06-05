import { NextResponse } from "next/server";
import { getResolvedData } from "@burnless/db";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { parseDateRange } from "@/lib/date-validation";
import { getActiveScenario } from "@/lib/scenario-middleware";
import { getTransactions, getForecastValues } from "@/lib/data";
import { computeFinancials } from "@/lib/compute-financials";

/**
 * GET /api/metrics?startDate=2026-01&endDate=2026-12
 *
 * Returns all computed financial and SaaS metrics.
 * Scenario ID comes from the X-Scenario-Id header via getActiveScenario.
 *
 * Routes through `computeFinancials` — the SAME compute the dashboard uses — so
 * metrics here include transaction actuals, Phase B carry-forward, coversHeadcount
 * reconciliation, and funding impact, and never diverge from the dashboard.
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

  // Resolve all entity types (base + scenario overrides), plus the actuals +
  // forecast-value overrides the shared compute needs.
  const data = await getResolvedData(ctx.companyId, scenarioId);
  const [transactions, forecastValues] = await Promise.all([
    getTransactions(ctx.companyId),
    getForecastValues(data.forecastLines.map((l) => l.id)),
  ]);

  const { metrics } = computeFinancials({
    accounts: data.financialAccounts,
    forecastLines: data.forecastLines,
    forecastValues,
    revenueStreams: data.revenueStreams,
    headcountPlans: data.headcountPlans,
    fundingRounds: data.fundingRounds,
    transactions,
    periodStart,
    periodEnd,
  });

  return NextResponse.json({
    scenarioId: scenarioId ?? null,
    period: { start: startDateStr, end: endDateStr },
    metrics,
  });
});
