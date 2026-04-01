import { eq, and } from "drizzle-orm";
import { db } from "../index";
import { scenarioOverrides, departments } from "../schema";
import { upsertOverride } from "./scenario-overrides";

/**
 * Validation: isSystem financial accounts cannot be overridden in scenarios.
 */
function validateOverridable(entityType: string, baseEntity: any) {
  if (entityType === "financial_account" && baseEntity?.isSystem) {
    throw new Error("System accounts cannot be modified in scenarios");
  }
}

/**
 * Insert a new entity, routing to scenario overrides when a scenario is active.
 *
 * - No scenario (null): inserts directly into the base table.
 * - Active scenario: creates an override with action=create.
 */
export async function scenarioInsert(
  entityType: string,
  table: any,
  data: Record<string, any>,
  scenarioId: string | null,
) {
  if (!scenarioId) {
    const [row] = await db.insert(table).values(data).returning();
    return row;
  }

  const id = data.id ?? crypto.randomUUID();
  const entityData = { ...data, id };
  await upsertOverride(scenarioId, entityType, id, "create", entityData, null);
  return entityData;
}

/**
 * Update an entity, routing to scenario overrides when a scenario is active.
 *
 * - No scenario (null): updates the base table directly.
 * - Active scenario, first override: creates override with action=modify, snapshots base.
 * - Active scenario, existing override: merges changes into override data (last-write-wins).
 * - Throws if the entity is a system financial account.
 */
export async function scenarioUpdate(
  entityType: string,
  table: any,
  entityId: string,
  changes: Record<string, any>,
  scenarioId: string | null,
) {
  if (!scenarioId) {
    const [row] = await db
      .update(table)
      .set(changes)
      .where(eq(table.id, entityId))
      .returning();
    return row;
  }

  // Check for existing override
  const existing = await db
    .select()
    .from(scenarioOverrides)
    .where(
      and(
        eq(scenarioOverrides.scenarioId, scenarioId),
        eq(scenarioOverrides.entityType, entityType),
        eq(scenarioOverrides.entityId, entityId),
      ),
    )
    .then((r) => r[0]);

  if (existing) {
    // Update existing override's data
    const updatedData = {
      ...(existing.data as Record<string, any>),
      ...changes,
    };
    await upsertOverride(
      scenarioId,
      entityType,
      entityId,
      existing.action as "create" | "modify" | "delete",
      updatedData,
      existing.originalData as Record<string, unknown> | null,
    );
    return updatedData;
  }

  // First override -- snapshot base state
  const [baseEntity] = await db
    .select()
    .from(table)
    .where(eq(table.id, entityId));
  validateOverridable(entityType, baseEntity);
  const overrideData = { ...baseEntity, ...changes };
  await upsertOverride(
    scenarioId,
    entityType,
    entityId,
    "modify",
    overrideData,
    baseEntity,
  );
  return overrideData;
}

/**
 * Delete an entity, routing to scenario overrides when a scenario is active.
 *
 * - No scenario (null): deletes from the base table.
 * - Active scenario, scenario-created entity: removes the override row entirely.
 * - Active scenario, base entity: creates override with action=delete, data=null.
 * - Department deletes cascade to child departments.
 * - Throws if the entity is a system financial account.
 */
export async function scenarioDelete(
  entityType: string,
  table: any,
  entityId: string,
  scenarioId: string | null,
) {
  if (!scenarioId) {
    await db.delete(table).where(eq(table.id, entityId));
    return;
  }

  // Check if this is a scenario-created entity
  const existing = await db
    .select()
    .from(scenarioOverrides)
    .where(
      and(
        eq(scenarioOverrides.scenarioId, scenarioId),
        eq(scenarioOverrides.entityType, entityType),
        eq(scenarioOverrides.entityId, entityId),
      ),
    )
    .then((r) => r[0]);

  if (existing?.action === "create") {
    // Deleting a scenario-created entity -- just remove the override
    await db
      .delete(scenarioOverrides)
      .where(eq(scenarioOverrides.id, existing.id));
    return;
  }

  // Hiding a base entity
  const [baseEntity] = await db
    .select()
    .from(table)
    .where(eq(table.id, entityId));
  validateOverridable(entityType, baseEntity);
  await upsertOverride(
    scenarioId,
    entityType,
    entityId,
    "delete",
    null,
    baseEntity,
  );

  // Cascade: if deleting a department, create delete overrides for children
  if (entityType === "department") {
    const children = await db
      .select()
      .from(departments)
      .where(eq(departments.parentId, entityId));
    for (const child of children) {
      await scenarioDelete("department", departments, child.id, scenarioId);
    }
  }
}
