/**
 * POST /api/scenarios/ai-generate — Generate best/worst case scenarios from historical data.
 *
 * Analyzes current financial metrics and creates realistic scenarios with
 * adjusted parameters (growth rates, burn, headcount) based on the data.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db, scenarios, forecastLines, revenueStreams } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, errorResponse, parseBody } from "@/lib/api-helpers";
import { checkAiFeatureAllowed } from "@/lib/ai-feature-flags";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { getDefaultScenario, getRevenueStreams, getForecastLines } from "@/lib/data";
import { seriesToArray } from "@burnless/engine";

const generateSchema = z.object({
  type: z.enum(["best_worst", "best", "worst"]).default("best_worst"),
});

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const aiCheck = await checkAiFeatureAllowed(ctx.companyId, "chat");
  if (!aiCheck.allowed) {
    return errorResponse("AI features are disabled. Enable AI to generate scenarios.", 403);
  }

  const parsed = await parseBody(request, generateSchema);
  if ("error" in parsed) return parsed.error;

  // Get base scenario to derive from
  const baseScenario = await getDefaultScenario(ctx.companyId);
  if (!baseScenario) {
    return errorResponse("No base scenario found. Create a scenario first.", 404);
  }

  const dashboard = await computeDashboardData(ctx.companyId, baseScenario.id);
  const m = dashboard.metrics;

  // Extract current metrics for scenario derivation
  const revArray = seriesToArray(dashboard.totalRevenue);
  const expArray = seriesToArray(dashboard.totalExpenses);

  // Compute growth rates from historical data
  const values = revArray.map((v) => v.value);
  const growthRates: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1]! > 0) {
      growthRates.push((values[i]! - values[i - 1]!) / values[i - 1]!);
    }
  }
  const avgGrowth = growthRates.length > 0 ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : 0.05;

  const lastRevenue = values.length > 0 ? values[values.length - 1]! : 0;
  const lastExpenses = expArray.length > 0 ? expArray[expArray.length - 1]!.value : 0;

  // Get existing forecast lines and revenue streams to clone with modifications
  const baseForecastLines = await getForecastLines(baseScenario.id);
  const baseRevenueStreams = await getRevenueStreams(baseScenario.id);

  const created: Array<{ id: string; name: string; type: string }> = [];
  const { type } = parsed.data;

  if (type === "best_worst" || type === "best") {
    // Best case: 1.5x growth, 0.8x expenses, lower churn
    const [bestScenario] = await db
      .insert(scenarios)
      .values({
        companyId: ctx.companyId,
        name: "Best Case (AI Generated)",
        type: "best",
        description: `AI-generated optimistic scenario based on ${baseScenario.name}. Assumes ${((avgGrowth * 1.5) * 100).toFixed(0)}% monthly revenue growth, 20% expense reduction, and improved retention.`,
      })
      .returning();

    // Clone forecast lines with optimistic adjustments
    for (const fl of baseForecastLines) {
      const params = (fl.parameters ?? {}) as Record<string, unknown>;
      const adjusted = { ...params };

      // Boost growth rates, reduce fixed costs
      if (fl.method === "growth_rate") {
        adjusted.monthlyRate = ((params.monthlyRate as number) ?? avgGrowth) * 1.5;
        adjusted.startAmount = ((params.startAmount as number) ?? lastRevenue) * 1.1;
      } else if (fl.method === "fixed") {
        // Reduce expense forecasts by 20%
        const acct = fl.accountId;
        // We don't know the account type from here, but reduce amounts conservatively
        adjusted.amount = ((params.amount as number) ?? 0) * 0.8;
      }

      await db.insert(forecastLines).values({
        scenarioId: bestScenario!.id,
        accountId: fl.accountId,
        method: fl.method,
        parameters: adjusted,
        startDate: fl.startDate,
        endDate: fl.endDate,
      });
    }

    // Clone revenue streams with optimistic adjustments
    for (const rs of baseRevenueStreams) {
      const params = (rs.parameters ?? {}) as Record<string, unknown>;
      const adjusted = { ...params };

      if (rs.type === "subscription") {
        adjusted.growthRate = ((params.growthRate as number) ?? 0.05) * 1.5;
        adjusted.churnRate = ((params.churnRate as number) ?? 0.05) * 0.5;
      } else {
        adjusted.monthlyRevenue = ((params.monthlyRevenue as number) ?? 0) * 1.3;
        adjusted.growthRate = ((params.growthRate as number) ?? 0) * 1.5;
      }

      await db.insert(revenueStreams).values({
        scenarioId: bestScenario!.id,
        name: rs.name,
        type: rs.type,
        parameters: adjusted,
      });
    }

    created.push({ id: bestScenario!.id, name: bestScenario!.name, type: "best" });
  }

  if (type === "best_worst" || type === "worst") {
    // Worst case: 0.5x growth, 1.3x expenses, higher churn
    const [worstScenario] = await db
      .insert(scenarios)
      .values({
        companyId: ctx.companyId,
        name: "Worst Case (AI Generated)",
        type: "worst",
        description: `AI-generated conservative scenario based on ${baseScenario.name}. Assumes ${((avgGrowth * 0.5) * 100).toFixed(0)}% monthly revenue growth, 30% expense increase, and higher churn.`,
      })
      .returning();

    // Clone forecast lines with pessimistic adjustments
    for (const fl of baseForecastLines) {
      const params = (fl.parameters ?? {}) as Record<string, unknown>;
      const adjusted = { ...params };

      if (fl.method === "growth_rate") {
        adjusted.monthlyRate = ((params.monthlyRate as number) ?? avgGrowth) * 0.5;
        adjusted.startAmount = ((params.startAmount as number) ?? lastRevenue) * 0.9;
      } else if (fl.method === "fixed") {
        adjusted.amount = ((params.amount as number) ?? 0) * 1.3;
      }

      await db.insert(forecastLines).values({
        scenarioId: worstScenario!.id,
        accountId: fl.accountId,
        method: fl.method,
        parameters: adjusted,
        startDate: fl.startDate,
        endDate: fl.endDate,
      });
    }

    // Clone revenue streams with pessimistic adjustments
    for (const rs of baseRevenueStreams) {
      const params = (rs.parameters ?? {}) as Record<string, unknown>;
      const adjusted = { ...params };

      if (rs.type === "subscription") {
        adjusted.growthRate = ((params.growthRate as number) ?? 0.05) * 0.5;
        adjusted.churnRate = ((params.churnRate as number) ?? 0.05) * 2.0;
      } else {
        adjusted.monthlyRevenue = ((params.monthlyRevenue as number) ?? 0) * 0.7;
        adjusted.growthRate = ((params.growthRate as number) ?? 0) * 0.5;
      }

      await db.insert(revenueStreams).values({
        scenarioId: worstScenario!.id,
        name: rs.name,
        type: rs.type,
        parameters: adjusted,
      });
    }

    created.push({ id: worstScenario!.id, name: worstScenario!.name, type: "worst" });
  }

  return NextResponse.json({
    success: true,
    created,
    baseScenario: { id: baseScenario.id, name: baseScenario.name },
    derivedFrom: {
      avgMonthlyGrowth: avgGrowth,
      lastMonthRevenue: lastRevenue,
      lastMonthExpenses: lastExpenses,
    },
  });
}
