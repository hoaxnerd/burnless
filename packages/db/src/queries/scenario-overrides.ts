import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../index";
import { scenarioOverrides } from "../schema";

/**
 * Get all overrides for a scenario, optionally filtered by entity type.
 */
export async function getOverridesForScenario(
  scenarioId: string,
  entityType?: string,
) {
  const conditions = [eq(scenarioOverrides.scenarioId, scenarioId)];
  if (entityType) conditions.push(eq(scenarioOverrides.entityType, entityType));
  return db.select().from(scenarioOverrides).where(and(...conditions));
}

/**
 * Insert or update a scenario override using last-write-wins semantics.
 * The unique constraint on (scenarioId, entityType, entityId) is used for conflict detection.
 */
export async function upsertOverride(
  scenarioId: string,
  entityType: string,
  entityId: string,
  action: "create" | "modify" | "delete",
  data: Record<string, unknown> | null,
  originalData: Record<string, unknown> | null,
) {
  return db
    .insert(scenarioOverrides)
    .values({
      scenarioId,
      entityType,
      entityId,
      action,
      data,
      originalData,
    })
    .onConflictDoUpdate({
      target: [
        scenarioOverrides.scenarioId,
        scenarioOverrides.entityType,
        scenarioOverrides.entityId,
      ],
      set: { action, data, originalData, updatedAt: new Date() },
    })
    .returning();
}

/**
 * Delete a scenario override by its primary key.
 */
export async function deleteOverride(overrideId: string) {
  return db
    .delete(scenarioOverrides)
    .where(eq(scenarioOverrides.id, overrideId));
}

/**
 * Delete a scenario override by its composite key (scenario + entity type + entity id).
 */
export async function deleteOverrideByEntity(
  scenarioId: string,
  entityType: string,
  entityId: string,
) {
  return db
    .delete(scenarioOverrides)
    .where(
      and(
        eq(scenarioOverrides.scenarioId, scenarioId),
        eq(scenarioOverrides.entityType, entityType),
        eq(scenarioOverrides.entityId, entityId),
      ),
    );
}

/**
 * Get the count of overrides for a scenario.
 */
export async function getOverrideCount(scenarioId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scenarioOverrides)
    .where(eq(scenarioOverrides.scenarioId, scenarioId));
  return result?.count ?? 0;
}

/**
 * Batched override counts for many scenarios in ONE grouped query (avoids the
 * N+1 of calling getOverrideCount per scenario — e.g. getScenarios for the list
 * + the slow /scenarios/compare RSC). Returns a Map keyed by scenarioId; scenarios
 * with zero overrides are simply absent from the map (callers default to 0).
 */
export async function getOverrideCounts(
  scenarioIds: string[],
): Promise<Map<string, number>> {
  if (scenarioIds.length === 0) return new Map();
  const rows = await db
    .select({
      scenarioId: scenarioOverrides.scenarioId,
      count: sql<number>`count(*)::int`,
    })
    .from(scenarioOverrides)
    .where(inArray(scenarioOverrides.scenarioId, scenarioIds))
    .groupBy(scenarioOverrides.scenarioId);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.scenarioId, r.count);
  return map;
}

/**
 * Grouped override breakdown for a set of scenarios — one row per
 * (scenarioId, entityType, action) with a count. Powers the list_scenarios diff
 * headline (Plan 5) without computing full dashboards.
 */
export async function getOverrideBreakdown(scenarioIds: string[]) {
  if (scenarioIds.length === 0) return [] as { scenarioId: string; entityType: string; action: string; count: number }[];
  return db
    .select({
      scenarioId: scenarioOverrides.scenarioId,
      entityType: scenarioOverrides.entityType,
      action: scenarioOverrides.action,
      count: sql<number>`count(*)::int`,
    })
    .from(scenarioOverrides)
    .where(inArray(scenarioOverrides.scenarioId, scenarioIds))
    .groupBy(scenarioOverrides.scenarioId, scenarioOverrides.entityType, scenarioOverrides.action);
}
