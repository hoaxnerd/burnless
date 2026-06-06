import { and, eq } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db } from "../index";
import { salaryChanges } from "../schema";
import { resolveEntities, type ResolvedEntity } from "./scenario-resolver";
import {
  scenarioInsert,
  scenarioUpdate,
  scenarioDelete,
} from "./scenario-mutations";

export type SalaryChange = InferSelectModel<typeof salaryChanges>;
export type NewSalaryChange = InferInsertModel<typeof salaryChanges>;

/** Base reads scoped to a (companyId, headcountId) pair. */
export async function listSalaryChanges(
  companyId: string,
  headcountId: string,
): Promise<SalaryChange[]> {
  return db
    .select()
    .from(salaryChanges)
    .where(
      and(
        eq(salaryChanges.companyId, companyId),
        eq(salaryChanges.headcountId, headcountId),
      ),
    );
}

/**
 * Scenario-aware read: merge base rows with overrides, then narrow to a
 * single headcountId so scenario-only `create` rows attached to other hires
 * don't leak in.
 */
export async function listResolvedSalaryChanges(
  companyId: string,
  headcountId: string,
  scenarioId: string | null,
): Promise<ResolvedEntity<SalaryChange>[]> {
  const base = await listSalaryChanges(companyId, headcountId);
  const resolved = await resolveEntities<SalaryChange>(
    "salary_change",
    base,
    scenarioId,
  );
  return resolved.filter((r) => r.headcountId === headcountId);
}

/** Create a salary change, routing through the scenario layer when active. */
export async function createSalaryChange(
  data: NewSalaryChange,
  scenarioId: string | null,
  companyId: string,
) {
  return scenarioInsert("salary_change", salaryChanges, data, scenarioId, companyId);
}

/** Update a salary change via the scenario layer. */
export async function updateSalaryChange(
  id: string,
  changes: Partial<NewSalaryChange>,
  scenarioId: string | null,
  companyId: string,
) {
  return scenarioUpdate("salary_change", salaryChanges, id, changes, scenarioId, companyId);
}

/** Delete a salary change via the scenario layer. */
export async function removeSalaryChange(
  id: string,
  scenarioId: string | null,
  companyId: string,
) {
  return scenarioDelete("salary_change", salaryChanges, id, scenarioId, companyId);
}
