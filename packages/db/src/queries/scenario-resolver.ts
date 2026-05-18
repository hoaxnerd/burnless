import { eq, and, inArray } from "drizzle-orm";
import { db } from "../index";
import {
  scenarioOverrides,
  revenueStreams,
  headcountPlans,
  forecastLines,
  fundingRounds,
  fundingRoundInvestors,
  departments,
  financialAccounts,
} from "../schema";
import { listShareClasses, listOptionPools } from "./funding";

// ── Types ────────────────────────────────────────────────────────────────────

export type OverrideTag = null | "modified" | "created";
export type ResolvedEntity<T> = T & { _override: OverrideTag };

// ── resolveEntities ──────────────────────────────────────────────────────────

/**
 * Merge base entities with scenario overrides to produce a resolved list.
 *
 * Rules:
 * - No scenario (null) → returns base entities with `_override: null`
 * - `modify` override → replaces base entity with override data, tagged `modified`
 * - `delete` override → base entity excluded from results
 * - `create` override → new entity appended, tagged `created`
 * - Dangling modify (base deleted but scenario has modify) → treated as `created`
 */
export async function resolveEntities<T extends { id: string }>(
  entityType: string,
  baseEntities: T[],
  scenarioId: string | null,
): Promise<ResolvedEntity<T>[]> {
  if (!scenarioId) {
    return baseEntities.map((e) => ({ ...e, _override: null as OverrideTag }));
  }

  const overrides = await db
    .select()
    .from(scenarioOverrides)
    .where(
      and(
        eq(scenarioOverrides.scenarioId, scenarioId),
        eq(scenarioOverrides.entityType, entityType),
      ),
    );

  const overrideMap = new Map(overrides.map((o) => [o.entityId, o]));
  const matchedOverrideIds = new Set<string>();
  const result: ResolvedEntity<T>[] = [];

  for (const entity of baseEntities) {
    const override = overrideMap.get(entity.id);
    if (!override) {
      result.push({ ...entity, _override: null });
    } else if (override.action === "modify") {
      matchedOverrideIds.add(override.id);
      result.push({ ...(override.data as T), _override: "modified" as const });
    } else if (override.action === "delete") {
      matchedOverrideIds.add(override.id);
      // Entity excluded from results
      continue;
    }
  }

  // Scenario-created entities
  for (const o of overrides.filter((o) => o.action === "create")) {
    result.push({ ...(o.data as T), _override: "created" as const });
  }

  // Dangling overrides: base entity was deleted but scenario had a modify override
  for (const o of overrides.filter(
    (o) => o.action === "modify" && !matchedOverrideIds.has(o.id),
  )) {
    result.push({ ...(o.data as T), _override: "created" as const });
  }

  return result;
}

// ── getResolvedData ──────────────────────────────────────────────────────────

/**
 * Resolve all entity types for a company, merging with scenario overrides.
 * Pass `scenarioId: null` for base (unmodified) data.
 */
export async function getResolvedData(
  companyId: string,
  scenarioId: string | null,
) {
  const [
    baseRevenue,
    baseHeadcount,
    baseForecast,
    baseFunding,
    baseDepts,
    baseAccounts,
    baseShareClasses,
    baseOptionPools,
  ] = await Promise.all([
    db.select().from(revenueStreams).where(eq(revenueStreams.companyId, companyId)),
    db.select().from(headcountPlans).where(eq(headcountPlans.companyId, companyId)),
    db.select().from(forecastLines).where(eq(forecastLines.companyId, companyId)),
    db.select().from(fundingRounds).where(eq(fundingRounds.companyId, companyId)),
    db.select().from(departments).where(eq(departments.companyId, companyId)),
    db.select().from(financialAccounts).where(eq(financialAccounts.companyId, companyId)),
    listShareClasses(companyId),
    listOptionPools(companyId),
  ]);

  // Fetch investors scoped to this company's rounds (done after baseFunding is known)
  const roundIds = baseFunding.map((r) => r.id);
  const baseInvestors =
    roundIds.length > 0
      ? await db
          .select()
          .from(fundingRoundInvestors)
          .where(inArray(fundingRoundInvestors.fundingRoundId, roundIds))
      : [];

  const [
    revenueResolved,
    headcountResolved,
    forecastResolved,
    fundingResolved,
    deptsResolved,
    accountsResolved,
  ] = await Promise.all([
    resolveEntities("revenue_stream", baseRevenue, scenarioId),
    resolveEntities("headcount_plan", baseHeadcount, scenarioId),
    resolveEntities("forecast_line", baseForecast, scenarioId),
    resolveEntities("funding_round", baseFunding, scenarioId),
    resolveEntities("department", baseDepts, scenarioId),
    resolveEntities("financial_account", baseAccounts, scenarioId),
  ]);

  return {
    revenueStreams: revenueResolved,
    headcountPlans: headcountResolved,
    forecastLines: forecastResolved,
    fundingRounds: fundingResolved,
    departments: deptsResolved,
    financialAccounts: accountsResolved,
    fundingRoundInvestors: baseInvestors.filter((i) =>
      fundingResolved.some((r) => r.id === i.fundingRoundId),
    ),
    shareClasses: baseShareClasses,
    optionPools: baseOptionPools,
  };
}
