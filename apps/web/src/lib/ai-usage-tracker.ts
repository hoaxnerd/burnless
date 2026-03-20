/**
 * AI usage persistence — wires the @burnless/ai usage event system
 * to the database for cost tracking and analytics.
 *
 * Called once at app startup (in instrumentation.ts or layout).
 */

import { onUsage, type UsageRecord } from "@burnless/ai";
import { db, aiUsageLogs } from "@burnless/db";

let initialized = false;

/**
 * Initialize AI usage tracking. Safe to call multiple times — only registers once.
 *
 * Must be called with a companyId resolver since the AI layer doesn't know about companies.
 */
export function initAiUsageTracking(getCompanyId: () => string | null) {
  if (initialized) return;
  initialized = true;

  onUsage((record: UsageRecord) => {
    const companyId = getCompanyId();
    if (!companyId) return;

    // Fire-and-forget — don't block AI responses for logging
    db.insert(aiUsageLogs)
      .values({
        companyId,
        feature: record.feature,
        tier: record.tier,
        provider: record.provider,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        estimatedCostMicros: record.estimatedCostMicros ?? 0,
        durationMs: record.durationMs ?? null,
      })
      .catch((err) => {
        console.warn("[ai-usage] Failed to persist usage record:", err);
      });
  });
}
