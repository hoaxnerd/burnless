import { and, eq } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db } from "../index";
import { bonuses } from "../schema";
import { resolveEntities, type ResolvedEntity } from "./scenario-resolver";
import {
  scenarioInsert,
  scenarioUpdate,
  scenarioDelete,
} from "./scenario-mutations";

export type Bonus = InferSelectModel<typeof bonuses>;
export type NewBonus = InferInsertModel<typeof bonuses>;

/** Base reads scoped to a (companyId, headcountId) pair. */
export async function listBonuses(
  companyId: string,
  headcountId: string,
): Promise<Bonus[]> {
  return db
    .select()
    .from(bonuses)
    .where(
      and(
        eq(bonuses.companyId, companyId),
        eq(bonuses.headcountId, headcountId),
      ),
    );
}

/** Scenario-aware read for a single headcountId. */
export async function listResolvedBonuses(
  companyId: string,
  headcountId: string,
  scenarioId: string | null,
): Promise<ResolvedEntity<Bonus>[]> {
  const base = await listBonuses(companyId, headcountId);
  const resolved = await resolveEntities<Bonus>("bonus", base, scenarioId);
  return resolved.filter((r) => r.headcountId === headcountId);
}

/** Create a bonus, routing through the scenario layer when active. */
export async function createBonus(
  data: NewBonus,
  scenarioId: string | null,
  companyId: string,
) {
  return scenarioInsert("bonus", bonuses, data, scenarioId, companyId);
}

/** Update a bonus via the scenario layer. */
export async function updateBonus(
  id: string,
  changes: Partial<NewBonus>,
  scenarioId: string | null,
  companyId: string,
) {
  return scenarioUpdate("bonus", bonuses, id, changes, scenarioId, companyId);
}

/** Delete a bonus via the scenario layer. */
export async function removeBonus(
  id: string,
  scenarioId: string | null,
  companyId: string,
) {
  return scenarioDelete("bonus", bonuses, id, scenarioId, companyId);
}
