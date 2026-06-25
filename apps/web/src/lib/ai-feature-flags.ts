/**
 * Server-side AI feature flag helpers.
 * Use these in API routes to check flags before making LLM calls.
 */

import { db } from "@burnless/db";
import { aiFeatureFlags, aiUsageLogs } from "@burnless/db";
import { getDefaultAiProvider, getResolvedDefaultModelId, decryptSecret } from "@burnless/db";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  DEFAULT_AI_FLAGS,
  canFeatureCallLlm,
  getPlan,
  type AiFeatureFlagsState,
  type AiFeatureName,
  type AiFeatureConfig,
  type AiWriteMode,
} from "@burnless/ai";
import { getCompanyPlan } from "./api-helpers";
import { getCapabilities } from "./capabilities";

// 1 credit = 1000 microdollars (matches MICROS_PER_CREDIT in plans.config.ts)
const MICROS_PER_CREDIT = 1000;

export interface CompanyProviderConfig {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface CreditStatus {
  used: number;
  total: number;
  remaining: number;
  percentUsed: number;
  warning: boolean;
  exceeded: boolean;
}

/**
 * Load AI feature flags for a company. Returns defaults if none exist.
 */
export async function getAiFlags(
  companyId: string
): Promise<AiFeatureFlagsState> {
  const [row] = await db
    .select()
    .from(aiFeatureFlags)
    .where(eq(aiFeatureFlags.companyId, companyId))
    .limit(1);

  if (!row) return { ...DEFAULT_AI_FLAGS };

  return {
    masterEnabled: row.masterEnabled,
    dataMode: row.dataMode as AiFeatureFlagsState["dataMode"],
    writeMode: (row.writeMode ?? "confirm") as AiWriteMode,
    features: (row.features ?? {}) as AiFeatureConfig,
    companionName: row.companionName ?? DEFAULT_AI_FLAGS.companionName,
  };
}

/**
 * Get the current month's AI credit usage for a company.
 */
export async function getMonthlyCreditsUsed(companyId: string): Promise<number> {
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

  const totalMicros = Number(result?.totalMicros ?? 0);
  return Math.ceil(totalMicros / MICROS_PER_CREDIT);
}

/**
 * Get credit status for a company based on their plan's monthly allocation.
 * Accepts optional planKey to avoid redundant getCompanyPlan queries.
 */
export async function getCreditStatus(companyId: string, planKey?: string): Promise<CreditStatus> {
  const resolvedPlanKey = planKey ?? await getCompanyPlan(companyId);
  const plan = getPlan(resolvedPlanKey);
  const used = await getMonthlyCreditsUsed(companyId);
  const total = plan.monthlyAiCredits;
  const remaining = Math.max(0, total - used);
  const percentUsed = total > 0 ? (used / total) * 100 : 0;

  return {
    used,
    total,
    remaining,
    percentUsed: Math.round(percentUsed * 10) / 10,
    warning: percentUsed >= 80 && percentUsed < 100,
    exceeded: percentUsed >= 100,
  };
}

/**
 * Check if a specific AI feature is allowed to make LLM calls.
 * Returns { allowed, reason, creditStatus } for use in API routes.
 *
 * Single DB query for flags (master, features, dataMode, writeMode) via getAiFlags.
 * Single getCompanyPlan call shared with getCreditStatus.
 */
export async function checkAiFeatureAllowed(
  companyId: string,
  feature: AiFeatureName
): Promise<{ allowed: boolean; reason?: string; creditStatus?: CreditStatus; writeMode?: AiWriteMode }> {
  const flags = await getAiFlags(companyId);

  if (!flags.masterEnabled) {
    return { allowed: false, reason: "AI features are disabled for this company" };
  }

  if (flags.features[feature] === false) {
    return { allowed: false, reason: `AI feature "${feature}" is disabled` };
  }

  if (!canFeatureCallLlm(flags, feature)) {
    return {
      allowed: false,
      reason: "AI is in cached-only or hidden mode — no new LLM calls allowed",
    };
  }

  // Spec S1 §5: credits are a billing concept. When billing is off (self_host,
  // or no payment provider configured), there is no credit ledger to enforce —
  // a self-host operator who brings their own AI provider via env must not be
  // throttled at a plan's credit cap. Mirrors feature-gate's planEnforcement bypass.
  if (!getCapabilities().billing) {
    return { allowed: true, writeMode: flags.writeMode };
  }

  // Credit enforcement: single getCompanyPlan call shared with getCreditStatus
  const planKey = await getCompanyPlan(companyId);
  const creditStatus = await getCreditStatus(companyId, planKey);
  if (creditStatus.exceeded) {
    const plan = getPlan(planKey);
    return {
      allowed: false,
      reason: `AI credits exhausted (${creditStatus.used.toLocaleString()} of ${creditStatus.total.toLocaleString()} monthly credits used). ${plan.upgradeTarget ? `Upgrade to ${getPlan(plan.upgradeTarget).name} for more credits` : "Wait until next month"} or adjust in Settings.`,
      creditStatus,
    };
  }

  return { allowed: true, creditStatus, writeMode: flags.writeMode };
}

/**
 * Resolve a company's AI provider config. Precedence (spec §2/§4):
 *   1. Default ENABLED DB provider (aiProviders) — keys decrypted here.
 *   2. undefined → caller uses env-var defaults (createProvider).
 * The legacy aiFeatureFlags BYOK columns were removed as a resolution leg in
 * S6 W1.1 (columns dropped separately). Decryption failures degrade to the env
 * path so the chat path never crashes. Edition-agnostic — same logic on
 * self_host and cloud (env fallback applies to both).
 */
export async function getCompanyProviderConfig(
  companyId: string
): Promise<CompanyProviderConfig | undefined> {
  // 1. DB default provider.
  const provider = await getDefaultAiProvider(companyId);
  if (provider) {
    let apiKey: string | undefined;
    try {
      apiKey = provider.apiKeyEncrypted ? decryptSecret(provider.apiKeyEncrypted) : undefined;
    } catch (e) {
      console.warn(`[ai-providers] key decrypt failed for provider ${provider.id}; falling back`, (e as Error).message);
      apiKey = undefined;
    }
    const keyless = provider.kind === "ollama" || provider.apiKeyMode === "none";
    if (apiKey || keyless) {
      const model = (await getResolvedDefaultModelId(provider.id)) ?? undefined;
      if (!model && !keyless) {
        console.warn(`[ai-providers] provider ${provider.id} (${provider.kind}) has no default model set; falling back to env/default model resolution`);
      }
      return { provider: provider.kind, apiKey, model, baseUrl: provider.baseUrl ?? undefined };
    }
    // provider exists but no usable key → fall through.
  }

  // 2. env path.
  return undefined;
}
