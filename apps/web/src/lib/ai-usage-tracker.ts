/**
 * AI usage persistence — wires the @burnless/ai usage event system
 * to the database for cost tracking and analytics.
 *
 * Registers a global listener once. Each request sets the current
 * company ID before making AI calls via `setTrackingCompanyId()`.
 */

import { onUsage, type UsageRecord } from "@burnless/ai";
import { db, aiUsageLogs } from "@burnless/db";

let initialized = false;

/**
 * Per-request company ID for usage tracking.
 * Set by API routes before making AI calls.
 * Uses a simple mutable ref — safe because Next.js API routes
 * are sequential within a single request/response cycle.
 */
let _currentCompanyId: string | null = null;

/** Set the company ID for the current AI operation. Call before any LLM call. */
export function setTrackingCompanyId(companyId: string): void {
  _currentCompanyId = companyId;
}

/**
 * Initialize AI usage tracking. Safe to call multiple times — only registers once.
 * Must be called at least once before any AI operation to ensure the listener exists.
 */
export function initAiUsageTracking() {
  if (initialized) return;
  initialized = true;

  onUsage((record: UsageRecord) => {
    const companyId = _currentCompanyId;
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

// Auto-initialize on import so all routes get tracking
initAiUsageTracking();
