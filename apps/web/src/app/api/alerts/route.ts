/**
 * GET /api/alerts — Generate proactive financial alerts from current data.
 * Returns alerts without requiring AI/LLM access (pure metric analysis).
 */

import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-helpers";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { getDefaultScenario } from "@/lib/data";
import { generateAlerts } from "@/lib/alerts";

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const scenario = await getDefaultScenario(ctx.companyId);
  if (!scenario) {
    return NextResponse.json({ alerts: [] });
  }

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
    });

    return NextResponse.json({ alerts });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}
