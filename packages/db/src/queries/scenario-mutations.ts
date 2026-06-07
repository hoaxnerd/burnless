import { eq, and } from "drizzle-orm";
import { db } from "../index";
import { scenarioOverrides, departments, scenarios } from "../schema";
import { upsertOverride, deleteOverrideByEntity } from "./scenario-overrides";

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
 * A computed scenario-override delta — the diff-before-apply payload (spec §4.2).
 * `remove_override` means "delete a scenario-CREATED entity by dropping its
 * override row" (no base row to hide); the other actions map to upsertOverride.
 */
export interface ScenarioPlan {
  action: "create" | "modify" | "delete" | "remove_override";
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * Pure planning counterpart of scenarioInsert: compute the create delta WITHOUT
 * writing. Plan mode only makes sense inside a scenario (the gate previews an
 * override), so scenarioId is required.
 *
 * `table` is accepted for API symmetry with scenarioInsert but unused: for
 * inserts the plan is synthetic (provided data + generated id); no base read needed.
 */
export async function planScenarioInsert(
  entityType: string,
  table: any,
  data: Record<string, any>,
  scenarioId: string,
  companyId: string,
): Promise<ScenarioPlan> {
  if (!scenarioId) throw new Error("planScenarioInsert requires an active scenario");
  await assertScenarioOwned(scenarioId, companyId);
  const id = data.id ?? crypto.randomUUID();
  const entityData = { ...data, id };
  return { action: "create", entityType, entityId: id, before: null, after: entityData };
}

/**
 * Apply a previously-computed ScenarioPlan to the override table. The single
 * write path the diff-gate Apply uses (spec §2 non-goal: Apply does not bypass
 * the normal write path).
 */
export async function commitScenarioPlan(
  scenarioId: string,
  plan: ScenarioPlan,
): Promise<void> {
  if (plan.action === "remove_override") {
    await deleteOverrideByEntity(scenarioId, plan.entityType, plan.entityId);
    return;
  }
  await upsertOverride(scenarioId, plan.entityType, plan.entityId, plan.action, plan.after, plan.before);
}

/**
 * Pure planning counterpart of scenarioUpdate: compute the modify delta WITHOUT
 * writing. Preserves an existing override's action + originalData; snapshots the
 * base row on first override; strips immutable funding_round roundType.
 *
 * Unlike planScenarioInsert, `table` IS used here — to snapshot the base row on first override.
 */
export async function planScenarioUpdate(
  entityType: string,
  table: any,
  entityId: string,
  changes: Record<string, any>,
  scenarioId: string,
  companyId: string,
): Promise<ScenarioPlan> {
  if (!scenarioId) throw new Error("planScenarioUpdate requires an active scenario");

  // Phase 2 D §1.2: roundType is immutable post-creation (defense-in-depth strip).
  if (entityType === "funding_round" && changes && "type" in changes) {
    const { type: _stripped, ...rest } = changes as Record<string, unknown>;
    changes = rest as typeof changes;
  }

  await assertScenarioOwned(scenarioId, companyId);

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
    const after = mergeChanges(
      existing.data as Record<string, unknown>,
      changes as Record<string, unknown>,
    );
    return {
      action: existing.action as "create" | "modify" | "delete",
      entityType,
      entityId,
      before: (existing.originalData as Record<string, unknown> | null) ?? null,
      after,
    };
  }

  const [baseEntity] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.companyId, companyId)));
  if (!baseEntity) throw new Error(`Entity ${entityType}/${entityId} not found`);
  validateOverridable(entityType, baseEntity);
  const after = mergeChanges(
    baseEntity as Record<string, unknown>,
    changes as Record<string, unknown>,
  );
  return {
    action: "modify",
    entityType,
    entityId,
    before: baseEntity as Record<string, unknown>,
    after,
  };
}

/**
 * Pure planning counterpart of scenarioDelete: compute the delete delta(s)
 * WITHOUT writing. A scenario-created entity yields one `remove_override` plan;
 * a base entity yields one `delete` plan. Department deletes cascade to child
 * departments (one delete plan each), mirroring scenarioDelete's cascade.
 */
export async function planScenarioDelete(
  entityType: string,
  table: any,
  entityId: string,
  scenarioId: string,
  companyId: string,
): Promise<ScenarioPlan[]> {
  if (!scenarioId) throw new Error("planScenarioDelete requires an active scenario");
  await assertScenarioOwned(scenarioId, companyId);

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

  // Deleting a scenario-created entity → drop the override row (no base to hide).
  // Mirrors scenarioDelete: this case does NOT cascade.
  if (existing?.action === "create") {
    return [
      {
        action: "remove_override",
        entityType,
        entityId,
        before: (existing.data as Record<string, unknown> | null) ?? null,
        after: null,
      },
    ];
  }

  const [baseEntity] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.companyId, companyId)));
  if (!baseEntity) throw new Error(`Entity ${entityType}/${entityId} not found`);
  validateOverridable(entityType, baseEntity);

  const plans: ScenarioPlan[] = [
    {
      action: "delete",
      entityType,
      entityId,
      before: baseEntity as Record<string, unknown>,
      after: null,
    },
  ];

  // Cascade: deleting a department hides its child departments too.
  if (entityType === "department") {
    const children = await db
      .select()
      .from(departments)
      .where(eq(departments.parentId, entityId));
    for (const child of children) {
      plans.push(
        ...(await planScenarioDelete("department", departments, child.id, scenarioId, companyId)),
      );
    }
  }

  return plans;
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
  const plan = await planScenarioInsert(entityType, table, data, scenarioId, companyId);
  await commitScenarioPlan(scenarioId, plan);
  // plan.after is always the inserted entity (never null for create); narrow away
  // the null that ScenarioPlan.after carries for delete plans, preserving the
  // pre-refactor non-null return contract.
  return plan.after as Record<string, unknown>;
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
  if (!scenarioId) {
    // Phase 2 D §1.2: strip immutable roundType on the base-table path too.
    if (entityType === "funding_round" && changes && "type" in changes) {
      const { type: _stripped, ...rest } = changes as Record<string, unknown>;
      changes = rest as typeof changes;
    }
    const [row] = await db
      .update(table)
      .set(changes)
      .where(and(eq(table.id, entityId), eq(table.companyId, companyId)))
      .returning();
    return row;
  }
  const plan = await planScenarioUpdate(entityType, table, entityId, changes, scenarioId, companyId);
  await commitScenarioPlan(scenarioId, plan);
  // plan.after is always the merged entity (never null for create/modify);
  // narrow away the null ScenarioPlan.after carries for delete plans.
  return plan.after as Record<string, unknown>;
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

  const plans = await planScenarioDelete(entityType, table, entityId, scenarioId, companyId);
  for (const plan of plans) {
    await commitScenarioPlan(scenarioId, plan);
  }
  return true;
}
