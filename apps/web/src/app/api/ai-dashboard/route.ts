/**
 * GET /api/ai-dashboard — CTO-level AI observability dashboard.
 *
 * Returns a combined view of:
 *   1. Monthly cost breakdown by feature
 *   2. Request volume and latency per feature
 *   3. Provider health: circuit breaker state, rate limit status
 *   4. Per-feature provider routing configuration
 *   5. Budget usage status
 */

import { NextResponse } from "next/server";
import { db, aiUsageLogs } from "@burnless/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireCompanyAccess, requireRole, withErrorHandler } from "@/lib/api-helpers";
import { getBudgetStatus } from "@/lib/ai-feature-flags";
import {
  getFeatureTierMap,
  getFeatureProviderMap,
  getAllProviderHealth,
} from "@burnless/ai";

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Admin-only endpoint
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") ?? "30", 10);
  const days = Math.min(Math.max(1, Number.isFinite(rawDays) ? rawDays : 30), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Run queries in parallel
  const [featureBreakdown, dailySpend, budget] = await Promise.all([
    // Per-feature aggregation with latency stats
    db
      .select({
        feature: aiUsageLogs.feature,
        tier: aiUsageLogs.tier,
        provider: aiUsageLogs.provider,
        totalInputTokens: sql<number>`sum(${aiUsageLogs.inputTokens})::int`,
        totalOutputTokens: sql<number>`sum(${aiUsageLogs.outputTokens})::int`,
        totalCostMicros: sql<number>`sum(${aiUsageLogs.estimatedCostMicros})::int`,
        requestCount: sql<number>`count(*)::int`,
        avgDurationMs: sql<number>`avg(${aiUsageLogs.durationMs})::int`,
        p50DurationMs: sql<number>`percentile_cont(0.5) within group (order by ${aiUsageLogs.durationMs})::int`,
        p95DurationMs: sql<number>`percentile_cont(0.95) within group (order by ${aiUsageLogs.durationMs})::int`,
        maxDurationMs: sql<number>`max(${aiUsageLogs.durationMs})::int`,
      })
      .from(aiUsageLogs)
      .where(
        and(
          eq(aiUsageLogs.companyId, ctx.companyId),
          gte(aiUsageLogs.createdAt, since),
        )
      )
      .groupBy(aiUsageLogs.feature, aiUsageLogs.tier, aiUsageLogs.provider),

    // Daily spend trend
    db
      .select({
        date: sql<string>`date_trunc('day', ${aiUsageLogs.createdAt})::date::text`,
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
      .groupBy(sql`date_trunc('day', ${aiUsageLogs.createdAt})`)
      .orderBy(sql`date_trunc('day', ${aiUsageLogs.createdAt})`),

    getBudgetStatus(ctx.companyId),
  ]);

  const totalCostMicros = featureBreakdown.reduce((s, f) => s + (f.totalCostMicros ?? 0), 0);
  const totalRequests = featureBreakdown.reduce((s, f) => s + (f.requestCount ?? 0), 0);

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    summary: {
      totalCostMicros,
      totalCostUSD: totalCostMicros / 1_000_000,
      totalRequests,
    },
    budget,
    featureBreakdown: featureBreakdown.map((f) => ({
      ...f,
      costUSD: (f.totalCostMicros ?? 0) / 1_000_000,
      percentOfTotal: totalCostMicros > 0
        ? Math.round(((f.totalCostMicros ?? 0) / totalCostMicros) * 1000) / 10
        : 0,
    })),
    dailySpend: dailySpend.map((d) => ({
      ...d,
      costUSD: (d.totalCostMicros ?? 0) / 1_000_000,
    })),
    providerHealth: getAllProviderHealth(),
    routing: {
      featureTiers: getFeatureTierMap(),
      featureProviders: getFeatureProviderMap(),
    },
  });
});
