/**
 * Insight invalidation — marks cached AI insights as stale when
 * underlying financial data changes.
 *
 * Call `invalidateInsights(companyId, source)` from any data mutation
 * route. The batch regeneration endpoint will pick up invalidations
 * after a grace period and regenerate affected insight types.
 *
 * Mutation source → affected insight types:
 *   expenses   → [expense, dashboard, scenario, reports]
 *   revenue    → [revenue, dashboard, scenario, reports]
 *   headcount  → [dashboard, scenario, team, reports]
 *   funding    → [dashboard, scenario, funding, reports]
 *   scenarios  → [scenario, dashboard]
 *   accounts   → [expense, revenue, dashboard, reports]
 */

import { db, insightInvalidations } from "@burnless/db";
import { logger } from "./logger";
import { markInsightsStale } from "./insight-staleness";

const log = logger("insight-invalidation");

/** Maps a data mutation source to the insight types it invalidates. */
const INVALIDATION_MAP: Record<string, string[]> = {
  expenses: ["expense", "dashboard", "scenario", "reports"],
  revenue: ["revenue", "dashboard", "scenario", "reports"],
  headcount: ["dashboard", "scenario", "team", "reports"],
  funding: ["dashboard", "scenario", "funding", "reports"],
  scenarios: ["scenario", "dashboard"],
  accounts: ["expense", "revenue", "dashboard", "reports"],
  "forecast-lines": ["revenue", "dashboard", "scenario", "reports"],
  departments: ["expense", "dashboard", "team"],
};

export type MutationSource = keyof typeof INVALIDATION_MAP;

/**
 * Mark insight types as invalidated for a company.
 * Uses upsert — if an invalidation already exists for the same
 * (companyId, insightType), it updates lastMutationAt and clears processedAt
 * to re-enter the queue.
 *
 * Fire-and-forget: errors are logged but don't block the mutation response.
 */
export async function invalidateInsights(
  companyId: string,
  source: string
): Promise<void> {
  const types = INVALIDATION_MAP[source];
  if (!types) {
    log.debug({ companyId, source }, "Unknown mutation source — skipping invalidation");
    return;
  }

  const now = new Date();

  try {
    await Promise.all(
      types.map((insightType) =>
        db
          .insert(insightInvalidations)
          .values({
            companyId,
            insightType,
            mutationSource: source,
            firstInvalidatedAt: now,
            lastMutationAt: now,
            processedAt: null,
          })
          .onConflictDoUpdate({
            target: [
              insightInvalidations.companyId,
              insightInvalidations.insightType,
            ],
            set: {
              mutationSource: source,
              lastMutationAt: now,
              processedAt: null, // re-enter queue
            },
          })
      )
    );

    // Surgically mark individual cache records as stale via metric DAG tracing
    await markInsightsStale(companyId, source).catch((err) => {
      log.warn({ companyId, source, err: err instanceof Error ? err : undefined },
        "markInsightsStale failed (non-blocking)");
    });

    log.debug(
      { companyId, source, types },
      "Insight invalidations recorded"
    );
  } catch (err) {
    log.warn(
      { companyId, source, err: err instanceof Error ? err : undefined },
      "Failed to record insight invalidations"
    );
  }
}
