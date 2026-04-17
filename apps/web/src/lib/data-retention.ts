import { db, aiConversations, aiInsightCache } from "@burnless/db";
import { lt, inArray, and } from "drizzle-orm";

/**
 * Data retention policies for burnless.
 *
 * AI conversation history: 90 days (configurable)
 * AI insight cache: respects expiresAt field, fallback 30 days
 *
 * Call `cleanupExpiredData()` from a scheduled job (cron, Vercel cron, etc.)
 */

/** Retention periods in milliseconds */
export const RETENTION_POLICIES = {
  /** AI conversations older than this are purged (default: 90 days) */
  aiConversationsDays: 90,
  /** Expired AI insight cache entries are always cleaned up */
  aiInsightCacheGraceDays: 0,
} as const;

/**
 * Purge AI conversations (and their cascading messages) older than the retention period.
 * Returns the number of conversations deleted.
 */
export async function purgeExpiredConversations(
  retentionDays = RETENTION_POLICIES.aiConversationsDays
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const expired = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(lt(aiConversations.updatedAt, cutoff));

  if (expired.length === 0) return 0;

  const expiredIds = expired.map((c) => c.id);

  // Messages cascade-delete when conversation is deleted
  await db
    .delete(aiConversations)
    .where(inArray(aiConversations.id, expiredIds));

  return expired.length;
}

/**
 * Purge expired AI insight cache entries.
 * Returns the number of cache entries deleted.
 */
export async function purgeExpiredInsightCache(): Promise<number> {
  const now = new Date();

  const expired = await db
    .select({ id: aiInsightCache.id })
    .from(aiInsightCache)
    .where(
      and(
        lt(aiInsightCache.expiresAt, now)
      )
    );

  if (expired.length === 0) return 0;

  const expiredIds = expired.map((c) => c.id);

  await db
    .delete(aiInsightCache)
    .where(inArray(aiInsightCache.id, expiredIds));

  return expired.length;
}

/**
 * Run all data retention cleanup tasks.
 * Intended to be called from a scheduled job.
 */
export async function cleanupExpiredData() {
  const [conversationsDeleted, cacheDeleted] = await Promise.all([
    purgeExpiredConversations(),
    purgeExpiredInsightCache(),
  ]);

  return {
    conversationsDeleted,
    cacheDeleted,
    cleanedAt: new Date().toISOString(),
  };
}
