/**
 * Tracks when financial data was last modified per company.
 *
 * Used by the AI insights system to avoid regenerating insights on every
 * page visit — only when underlying data has actually changed, and only
 * after a grace period to batch rapid edits.
 *
 * Dual-layer tracking:
 *   1. Redis/memory timestamp — fast freshness check for the GET endpoint
 *   2. DB-backed insight_invalidations — durable queue for batch regeneration cron
 *
 * Primary store: Redis (key per company).
 * Fallback: in-memory Map (single-instance only, cleared on restart).
 */

import { getRedis } from "./redis";
import { invalidateInsights, type MutationSource } from "./insight-invalidation";

const REDIS_PREFIX = "burnless:data-modified:";

/** Grace period before insights should regenerate after a data change. */
export const MUTATION_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

// In-memory fallback when Redis is unavailable
const memoryStore = new Map<string, number>();

/**
 * Record that financial data was modified for a company.
 * Call this from any API route that mutates expenses, revenue, team, funding, etc.
 *
 * @param companyId - The company whose data was modified
 * @param source - What kind of data changed (e.g., "expenses", "revenue", "headcount").
 *   Used to determine which insight types need regeneration.
 *   Falls back to "expenses" if not provided (backward compat).
 */
export async function trackDataMutation(
  companyId: string,
  source: MutationSource = "expenses"
): Promise<void> {
  const now = Date.now();
  const redis = getRedis();

  if (redis) {
    try {
      // Store timestamp, expire after 48h (longer than any cache TTL)
      await redis.set(`${REDIS_PREFIX}${companyId}`, now.toString(), "EX", 172800);
    } catch {
      // Fall through to in-memory
      memoryStore.set(companyId, now);
    }
  } else {
    memoryStore.set(companyId, now);
  }

  // Queue per-type insight invalidations (fire-and-forget, non-blocking)
  invalidateInsights(companyId, source).catch(() => {
    // Errors already logged inside invalidateInsights
  });
}

/**
 * Get the timestamp of the last data mutation for a company.
 * Returns null if no mutation has been tracked (or store is empty).
 */
export async function getLastMutationTime(companyId: string): Promise<number | null> {
  const redis = getRedis();

  if (redis) {
    try {
      const val = await redis.get(`${REDIS_PREFIX}${companyId}`);
      return val ? parseInt(val, 10) : null;
    } catch {
      // Fall through to in-memory
    }
  }

  return memoryStore.get(companyId) ?? null;
}

/**
 * Check whether insights need regeneration based on data mutations.
 *
 * Returns:
 * - `{ needsRegeneration: false }` — data hasn't changed since last insight generation
 * - `{ needsRegeneration: false, graceRemaining }` — data changed but grace period active
 * - `{ needsRegeneration: true, dataChangedAt }` — data changed and grace period elapsed
 */
export async function checkInsightFreshness(
  companyId: string,
  lastInsightGeneratedAt: Date | null
): Promise<{
  needsRegeneration: boolean;
  dataChangedAt: number | null;
  graceRemaining: number | null;
}> {
  const lastMutation = await getLastMutationTime(companyId);

  // No mutation tracked — insights are fresh
  if (lastMutation === null) {
    return { needsRegeneration: false, dataChangedAt: null, graceRemaining: null };
  }

  // If we have cached insights, check if data changed after generation
  if (lastInsightGeneratedAt) {
    const generatedAt = lastInsightGeneratedAt.getTime();
    if (lastMutation <= generatedAt) {
      // Data hasn't changed since last generation
      return { needsRegeneration: false, dataChangedAt: lastMutation, graceRemaining: null };
    }
  }

  // Data changed — check grace period
  const elapsed = Date.now() - lastMutation;
  if (elapsed < MUTATION_GRACE_PERIOD_MS) {
    return {
      needsRegeneration: false,
      dataChangedAt: lastMutation,
      graceRemaining: MUTATION_GRACE_PERIOD_MS - elapsed,
    };
  }

  // Grace period elapsed — regeneration needed
  return { needsRegeneration: true, dataChangedAt: lastMutation, graceRemaining: null };
}
