/**
 * Insight staleness — marks individual AI insight cache records as stale
 * when data mutations affect the metrics they reference.
 *
 * Uses the metric dependency DAG to surgically determine which cached
 * insights are affected by a given data mutation, rather than blanket-
 * invalidating all insights of a type.
 *
 * Feature flag controls behavior:
 *   - "mark": Set staleAt/staleReason on cache records (default)
 *   - "remove": Delete affected cache records (forces regeneration on next visit)
 */

import { db, aiInsightCache } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { getAffectedMetricSlugs } from "@burnless/engine";
import { logger } from "./logger";

const log = logger("insight-staleness");

/** Feature flag: "mark" shows stale indicator, "remove" deletes and forces regen. */
const STALE_BEHAVIOR: "mark" | "remove" =
  (process.env.STALE_INSIGHT_BEHAVIOR as "mark" | "remove") ?? "mark";

interface Insight {
  relatedMetrics?: string[];
  [key: string]: unknown;
}

/**
 * Mark (or remove) cached insights that are affected by a data mutation.
 *
 * @param companyId - Company whose insights to check
 * @param entityType - What kind of data changed (e.g. "revenue", "headcount")
 */
export async function markInsightsStale(
  companyId: string,
  entityType: string
): Promise<void> {
  const affectedSlugs = getAffectedMetricSlugs(entityType);
  if (affectedSlugs.length === 0) return;

  const isWildcard = affectedSlugs.includes("*");

  try {
    // Fetch all non-stale cached insights for this company
    const rows = await db
      .select()
      .from(aiInsightCache)
      .where(
        and(
          eq(aiInsightCache.companyId, companyId),
          isNull(aiInsightCache.staleAt)
        )
      );

    if (rows.length === 0) return;

    const now = new Date();
    const reason = `${entityType}_edited`;

    for (const row of rows) {
      const insights = row.content as Insight[];
      if (!Array.isArray(insights)) continue;

      // Check if any insight in this cache row references an affected metric
      const isAffected = isWildcard || insights.some((insight) => {
        const related = insight.relatedMetrics;
        if (!Array.isArray(related) || related.length === 0) return true; // No metadata = assume affected
        return related.some((slug) => affectedSlugs.includes(slug));
      });

      if (!isAffected) continue;

      if (STALE_BEHAVIOR === "remove") {
        await db
          .delete(aiInsightCache)
          .where(eq(aiInsightCache.id, row.id));
      } else {
        await db
          .update(aiInsightCache)
          .set({ staleAt: now, staleReason: reason })
          .where(eq(aiInsightCache.id, row.id));
      }
    }

    log.debug(
      { companyId, entityType, affectedSlugs: affectedSlugs.length, behavior: STALE_BEHAVIOR },
      "Insight staleness processed"
    );
  } catch (err) {
    log.warn(
      { companyId, entityType, err: err instanceof Error ? err : undefined },
      "Failed to mark insights stale"
    );
  }
}
