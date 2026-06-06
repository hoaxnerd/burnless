import { eq, and } from "drizzle-orm";
import { db } from "../index";
import { scenarioOverrides, departments, scenarios } from "../schema";
import { upsertOverride } from "./scenario-overrides";

/**
 * Security / multi-tenancy guard: every scenario mutation is scoped to a
 * companyId. Base-table ops and base snapshots filter `WHERE id AND company_id`,
 * and any scenario write first verifies the scenario belongs to the company.
 * Without this a caller could read/update/delete another company's row (or
 * write into another company's scenario) by passing a foreign id — see
 * `__tests__/queries-scenario-security.test.ts`.
 */
async function assertScenarioOwned(scenarioId: string, companyId: string) {
  const [owned] = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, companyId)))
    .limit(1);
  if (!owned) {
    throw new Error(`Scenario ${scenarioId} not found for company ${companyId}`);
  }
}

/**
 * Keys whose values are plain JSONB objects that should merge (not replace)
 * when a scenario update supplies a partial version. An AI tool (or any
 * partial-update caller) should be able to set one field inside `parameters`
 * without wiping the other fields.
 */
const MERGABLE_JSONB_KEYS = new Set(["parameters"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mergeChanges(
  base: Record<string, unknown>,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base, ...changes };
  for (const key of MERGABLE_JSONB_KEYS) {
    const baseVal = base[key];
    const changeVal = changes[key];
    if (isPlainObject(baseVal) && isPlainObject(changeVal)) {
      merged[key] = { ...baseVal, ...changeVal };
    }
  }
  return merged;
}

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
  companyId: string,
) {
  if (!scenarioId) {
    const [row] = await db.insert(table).values(data).returning();
    return row;
  }

  await assertScenarioOwned(scenarioId, companyId);
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
  companyId: string,
) {
  // Phase 2 D §1.2: roundType is immutable post-creation. The primary gate is the
  // update_funding_round Zod schema in packages/ai/src/schemas/funding.ts which omits
  // the field entirely. This strip is defense-in-depth for any direct caller that
  // bypasses the schema (e.g. raw DB scripts, future internal tools). Mutates the
  // local `changes` reference by reassignment — function param is not reused after.
  if (entityType === "funding_round" && changes && "type" in changes) {
    const { type: _stripped, ...rest } = changes as Record<string, unknown>;
    changes = rest as typeof changes;
  }

  if (!scenarioId) {
    const [row] = await db
      .update(table)
      .set(changes)
      .where(and(eq(table.id, entityId), eq(table.companyId, companyId)))
      .returning();
    return row;
  }

  await assertScenarioOwned(scenarioId, companyId);

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
    // Update existing override's data — merge nested JSONB (parameters)
    // so partial updates don't clobber untouched keys.
    const updatedData = mergeChanges(
      existing.data as Record<string, unknown>,
      changes as Record<string, unknown>,
    );
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

  // First override -- snapshot base state (company-scoped: never snapshot
  // another tenant's row)
  const [baseEntity] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.companyId, companyId)));
  if (!baseEntity) throw new Error(`Entity ${entityType}/${entityId} not found`);
  validateOverridable(entityType, baseEntity);
  const overrideData = mergeChanges(
    baseEntity as Record<string, unknown>,
    changes as Record<string, unknown>,
  );
  await upsertOverride(
    scenarioId,
    entityType,
    entityId,
    "modify",
    overrideData,
    baseEntity as Record<string, unknown>,
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
  companyId: string,
): Promise<boolean> {
  if (!scenarioId) {
    const deleted = await db
      .delete(table)
      .where(and(eq(table.id, entityId), eq(table.companyId, companyId)))
      .returning();
    if (deleted.length > 0) {
      // GC any scenario overrides that referenced this now-deleted base row.
      // entityId is a globally-unique UUID, so a dangling modify/delete override
      // for it would otherwise resurface as a phantom "created" entity in scenario
      // views (resolveEntities dangling-modify path). Clean them up at the source.
      await db
        .delete(scenarioOverrides)
        .where(
          and(
            eq(scenarioOverrides.entityType, entityType),
            eq(scenarioOverrides.entityId, entityId),
          ),
        );
    }
    return deleted.length > 0;
  }

  await assertScenarioOwned(scenarioId, companyId);

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
    return true;
  }

  // Hiding a base entity (company-scoped: never snapshot another tenant's row)
  const [baseEntity] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.companyId, companyId)));
  if (!baseEntity) throw new Error(`Entity ${entityType}/${entityId} not found`);
  validateOverridable(entityType, baseEntity);
  await upsertOverride(
    scenarioId,
    entityType,
    entityId,
    "delete",
    null,
    baseEntity as Record<string, unknown>,
  );

  // Cascade: if deleting a department, create delete overrides for children
  if (entityType === "department") {
    const children = await db
      .select()
      .from(departments)
      .where(eq(departments.parentId, entityId));
    for (const child of children) {
      await scenarioDelete("department", departments, child.id, scenarioId, companyId);
    }
  }

  return true;
}
