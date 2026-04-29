/**
 * GET /api/alerts — Generate proactive financial alerts from current data.
 * Returns alerts without requiring AI/LLM access (pure metric analysis).
 */

import { NextResponse } from "next/server";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { getDefaultScenario, getCompany } from "@/lib/data";
import { generateAlerts } from "@/lib/alerts";
import { isValidCurrency, type CurrencyCode } from "@burnless/types";

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const [scenario, company] = await Promise.all([
    getDefaultScenario(ctx.companyId),
    getCompany(),
  ]);

  if (!scenario) {
    return NextResponse.json({ alerts: [] });
  }

  const currency: CurrencyCode = company?.currency && isValidCurrency(company.currency) ? company.currency : "USD";
  const locale = company?.locale ?? undefined;

  try {
    const dashboard = await computeDashboardData(ctx.companyId, scenario.id);

    if (!dashboard.hasData) {
      return NextResponse.json({ alerts: [] });
    }

    const metrics = dashboard.metrics;

    const alerts = generateAlerts({
      cashRunway: metrics.cashRunwayMonths,
      netBurnRate: metrics.netBurnRate,
      mrr: metrics.mrr,
      cashPosition: metrics.cashPosition,
      currentMonth: dashboard.currentMonth,
      currency,
      locale,
    });

    return NextResponse.json({ alerts });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
});
