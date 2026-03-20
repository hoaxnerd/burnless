/**
 * Server-side AI feature flag helpers.
 * Use these in API routes to check flags before making LLM calls.
 */

import { db } from "@burnless/db";
import { aiFeatureFlags } from "@burnless/db";
import { eq } from "drizzle-orm";
import {
  DEFAULT_AI_FLAGS,
  canFeatureCallLlm,
  type AiFeatureFlagsState,
  type AiFeatureName,
  type AiFeatureConfig,
} from "@burnless/ai";

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

  if (!row) return DEFAULT_AI_FLAGS;

  return {
    masterEnabled: row.masterEnabled,
    dataMode: row.dataMode as AiFeatureFlagsState["dataMode"],
    features: row.features as AiFeatureConfig,
  };
}

/**
 * Check if a specific AI feature is allowed to make LLM calls.
 * Returns { allowed, reason } for use in API routes.
 */
export async function checkAiFeatureAllowed(
  companyId: string,
  feature: AiFeatureName
): Promise<{ allowed: boolean; reason?: string }> {
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

  return { allowed: true };
}
