/**
 * Server-side AI feature flag helpers.
 * Use these in API routes to check flags before making LLM calls.
 */

import { db } from "@burnless/db";
import { aiFeatureFlags, aiUsageLogs } from "@burnless/db";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  DEFAULT_AI_FLAGS,
  canFeatureCallLlm,
  type AiFeatureFlagsState,
  type AiFeatureName,
  type AiFeatureConfig,
} from "@burnless/ai";

export interface AiFlagsWithBudget extends AiFeatureFlagsState {
  monthlyBudgetCents: number;
}

/**
 * Load AI feature flags for a company. Returns defaults if none exist.
 */
export async function getAiFlags(
  companyId: string
): Promise<AiFlagsWithBudget> {
  const [row] = await db
    .select()
    .from(aiFeatureFlags)
    .where(eq(aiFeatureFlags.companyId, companyId))
    .limit(1);

  if (!row) return { ...DEFAULT_AI_FLAGS, monthlyBudgetCents: 5000 };

  return {
    masterEnabled: row.masterEnabled,
    dataMode: row.dataMode as AiFeatureFlagsState["dataMode"],
    features: row.features as AiFeatureConfig,
    monthlyBudgetCents: row.monthlyBudgetCents,
  };
}

/**
 * Get the current month's AI spend in cents for a company.
 */
export async function getMonthlySpendCents(companyId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [result] = await db
    .select({
      totalMicros: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostMicros}), 0)::bigint`,
    })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.companyId, companyId),
        gte(aiUsageLogs.createdAt, monthStart),
      )
    );

  // Convert microdollars to cents: 1 cent = 10,000 microdollars
  return Math.round(Number(result?.totalMicros ?? 0) / 10_000);
}

export interface BudgetStatus {
  spentCents: number;
  budgetCents: number;
  percentUsed: number;
  warning: boolean;
  exceeded: boolean;
}

/**
 * Get budget status for a company.
 */
export async function getBudgetStatus(companyId: string): Promise<BudgetStatus> {
  const flags = await getAiFlags(companyId);
  const spentCents = await getMonthlySpendCents(companyId);
  const budgetCents = flags.monthlyBudgetCents;
  const percentUsed = budgetCents > 0 ? (spentCents / budgetCents) * 100 : 0;

  return {
    spentCents,
    budgetCents,
    percentUsed: Math.round(percentUsed * 10) / 10,
    warning: percentUsed >= 80 && percentUsed < 100,
    exceeded: percentUsed >= 100,
  };
}

/**
 * Check if a specific AI feature is allowed to make LLM calls.
 * Returns { allowed, reason, budgetStatus } for use in API routes.
 */
export async function checkAiFeatureAllowed(
  companyId: string,
  feature: AiFeatureName
): Promise<{ allowed: boolean; reason?: string; budgetStatus?: BudgetStatus }> {
  const flags = await getAiFlags(companyId);

  if (!flags.masterEnabled) {
    return { allowed: false, reason: "AI features are disabled for this company" };
  }

  if (!flags.features[feature]) {
    return { allowed: false, reason: `AI feature "${feature}" is disabled` };
  }

  if (!canFeatureCallLlm(flags, feature)) {
    return {
      allowed: false,
      reason: "AI is in cached-only or hidden mode — no new LLM calls allowed",
    };
  }

  // Budget enforcement: check monthly spend against cap
  const budgetStatus = await getBudgetStatus(companyId);
  if (budgetStatus.exceeded) {
    return {
      allowed: false,
      reason: `AI budget exceeded ($${(budgetStatus.spentCents / 100).toFixed(2)} of $${(budgetStatus.budgetCents / 100).toFixed(2)} monthly cap). Adjust your budget in Settings > AI Features or wait until next month.`,
      budgetStatus,
    };
  }

  return { allowed: true, budgetStatus };
}
