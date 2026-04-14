import { NextResponse } from "next/server";
import { db, aiUsageLogs } from "@burnless/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { getCreditStatus } from "@/lib/ai-feature-flags";

/**
 * GET /api/ai-costs — AI cost dashboard data.
 *
 * Returns per-feature spend breakdown for the current billing period (last 30 days).
 * Query params: ?days=30 (default), ?days=7
 */
export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") ?? "30", 10);
  const days = Math.min(Math.max(1, Number.isFinite(rawDays) ? rawDays : 30), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Per-feature aggregation
  const featureBreakdown = await db
    .select({
      feature: aiUsageLogs.feature,
      tier: aiUsageLogs.tier,
      totalInputTokens: sql<number>`sum(${aiUsageLogs.inputTokens})::int`,
      totalOutputTokens: sql<number>`sum(${aiUsageLogs.outputTokens})::int`,
      totalCostMicros: sql<number>`sum(${aiUsageLogs.estimatedCostMicros})::int`,
      requestCount: sql<number>`count(*)::int`,
      avgDurationMs: sql<number>`avg(${aiUsageLogs.durationMs})::int`,
    })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.companyId, ctx.companyId),
        gte(aiUsageLogs.createdAt, since),
      )
    )
    .groupBy(aiUsageLogs.feature, aiUsageLogs.tier);

  // Daily spend (for chart)
  const dailySpend = await db
    .select({
      date: sql<string>`date_trunc('day', ${aiUsageLogs.createdAt})::date::text`,
      totalCostMicros: sql<number>`sum(${aiUsageLogs.estimatedCostMicros})::int`,
      requestCount: sql<number>`count(*)::int`,
    })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.companyId, ctx.companyId),
        gte(aiUsageLogs.createdAt, since),
      )
    )
    .groupBy(sql`date_trunc('day', ${aiUsageLogs.createdAt})`)
    .orderBy(sql`date_trunc('day', ${aiUsageLogs.createdAt})`);

  const totalCostMicros = featureBreakdown.reduce((sum, f) => sum + (f.totalCostMicros ?? 0), 0);
  const totalRequests = featureBreakdown.reduce((sum, f) => sum + (f.requestCount ?? 0), 0);

  const credits = await getCreditStatus(ctx.companyId);

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    totalCostMicros,
    totalCostUSD: totalCostMicros / 1_000_000,
    totalRequests,
    credits,
    featureBreakdown: featureBreakdown.map((f) => ({
      ...f,
      costUSD: (f.totalCostMicros ?? 0) / 1_000_000,
      percentOfTotal: totalCostMicros > 0 ? ((f.totalCostMicros ?? 0) / totalCostMicros * 100) : 0,
    })),
    dailySpend: dailySpend.map((d) => ({
      ...d,
      costUSD: (d.totalCostMicros ?? 0) / 1_000_000,
    })),
  });
});
