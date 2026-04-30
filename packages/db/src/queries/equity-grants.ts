import { and, eq } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db } from "../index";
import { equityGrants } from "../schema";
import { resolveEntities, type ResolvedEntity } from "./scenario-resolver";
import {
  scenarioInsert,
  scenarioUpdate,
  scenarioDelete,
} from "./scenario-mutations";

export type EquityGrant = InferSelectModel<typeof equityGrants>;
export type NewEquityGrant = InferInsertModel<typeof equityGrants>;

/** Base reads scoped to a (companyId, headcountId) pair. */
export async function listEquityGrants(
  companyId: string,
  headcountId: string,
): Promise<EquityGrant[]> {
  return db
    .select()
    .from(equityGrants)
    .where(
      and(
        eq(equityGrants.companyId, companyId),
        eq(equityGrants.headcountId, headcountId),
      ),
    );
}

/** Scenario-aware read for a single headcountId. */
export async function listResolvedEquityGrants(
  companyId: string,
  headcountId: string,
  scenarioId: string | null,
): Promise<ResolvedEntity<EquityGrant>[]> {
  const base = await listEquityGrants(companyId, headcountId);
  const resolved = await resolveEntities<EquityGrant>(
    "equity_grant",
    base,
    scenarioId,
  );
  return resolved.filter((r) => r.headcountId === headcountId);
}

/** Create an equity grant, routing through the scenario layer when active. */
export async function createEquityGrant(
  data: NewEquityGrant,
  scenarioId: string | null,
) {
  return scenarioInsert("equity_grant", equityGrants, data, scenarioId);
}

/** Update an equity grant via the scenario layer. */
export async function updateEquityGrant(
  id: string,
  changes: Partial<NewEquityGrant>,
  scenarioId: string | null,
) {
  return scenarioUpdate(
    "equity_grant",
    equityGrants,
    id,
    changes,
    scenarioId,
  );
}

/** Delete an equity grant via the scenario layer. */
export async function removeEquityGrant(
  id: string,
  scenarioId: string | null,
) {
  return scenarioDelete("equity_grant", equityGrants, id, scenarioId);
}
