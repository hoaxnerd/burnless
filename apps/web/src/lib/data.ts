/**
 * Server-side data access layer. Used by server components to fetch data.
 *
 * DB queries are wrapped with cachedQuery (a wrapper around unstable_cache)
 * for cross-request caching. Cache tags allow targeted invalidation when
 * data is mutated via API routes.
 *
 * IMPORTANT: unstable_cache serializes results as JSON, which converts Date
 * objects to strings. cachedQuery automatically revives ISO date strings
 * back to Date objects so consumers get correct types.
 */

import { cache } from "react";
import {
  db,
  getCompanyForUser,
  getOverrideCount,
  listResolvedSalaryChanges,
  listResolvedBonuses,
  listResolvedEquityGrants,
  type SalaryChange,
  type Bonus,
  type EquityGrant,
} from "@burnless/db";
import type { ResolvedEntity } from "@burnless/db";
import {
  companies,
  scenarios,
  forecastLines,
  forecastValues,
  financialAccounts,
  revenueStreams,
  headcountPlans,
  transactions,
  departments,
  fundingRounds,
  dashboardPreferences,
} from "@burnless/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "./auth";

// ── Date revival for unstable_cache ─────────────────────────────────────────
// unstable_cache serializes via JSON, turning Date objects into ISO strings.
// This reviver walks the deserialized result and converts them back.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function reviveDates<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === "string" && ISO_DATE_RE.test(value)) {
    return new Date(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(reviveDates) as unknown as T;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const revived: Record<string, unknown> = {};
    for (const key in obj) {
      revived[key] = reviveDates(obj[key]);
    }
    return revived as T;
  }
  return value;
}

/**
 * Wrapper around unstable_cache that revives Date objects after deserialization.
 * Drop-in replacement — same signature as unstable_cache.
 */
function cachedQuery<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyParts: string[],
  options: { revalidate?: number | false; tags?: string[] }
): T {
  const cached = unstable_cache(fn, keyParts, options);
  return (async (...args: Parameters<T>) => {
    const result = await cached(...args);
    return reviveDates(result);
  }) as unknown as T;
}

/** Get the company for a specific user via their membership. */
export async function getCompanyForAuthUser(userId: string) {
  const membership = await getCompanyForUser(userId);
  if (!membership) return null;
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, membership.companyId))
    .limit(1);
  return company ?? null;
}

/**
 * Get company for the currently authenticated user.
 * Wrapped with React cache() so multiple server components calling this
 * in the same request only trigger one auth() + DB query.
 */
export const getCompany = cache(async function getCompany() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getCompanyForAuthUser(session.user.id);
});

/** Get all scenarios for a company (excludes soft-deleted), with override counts. */
export const getScenarios = cachedQuery(
  async (companyId: string) => {
    const rows = await db.select().from(scenarios).where(and(eq(scenarios.companyId, companyId), isNull(scenarios.deletedAt))).orderBy(scenarios.createdAt);
    return Promise.all(
      rows.map(async (s) => ({
        ...s,
        overrideCount: await getOverrideCount(s.id),
      }))
    );
  },
  ["scenarios"],
  { revalidate: 30, tags: ["scenarios"] }
);

/**
 * Get the first active scenario for a company.
 * The overlay model has no "default" scenario — this returns the first non-deleted one.
 */
export const getDefaultScenario = cachedQuery(
  async (companyId: string) => {
    const [first] = await db
      .select()
      .from(scenarios)
      .where(and(eq(scenarios.companyId, companyId), isNull(scenarios.deletedAt)))
      .limit(1);
    return first ?? null;
  },
  ["default-scenario"],
  { revalidate: 30, tags: ["scenarios"] }
);

/** Get all financial accounts for a company. */
export const getAccounts = cachedQuery(
  async (companyId: string) => {
    return db.select().from(financialAccounts).where(eq(financialAccounts.companyId, companyId));
  },
  ["accounts"],
  { revalidate: 60, tags: ["accounts"] }
);

/**
 * Get all forecast lines for a scenario's company.
 * Looks up the companyId from the scenario for backward compatibility.
 * In the overlay model, forecast lines are company-scoped base data.
 */
export const getForecastLines = cachedQuery(
  async (scenarioId: string) => {
    const [scenario] = await db.select({ companyId: scenarios.companyId }).from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
    if (!scenario) return [];
    return db.select().from(forecastLines).where(eq(forecastLines.companyId, scenario.companyId));
  },
  ["forecast-lines"],
  { revalidate: 30, tags: ["forecast-lines"] }
);

/** Get forecast values (overrides) for a set of forecast lines. */
export async function getForecastValues(lineIds: string[]) {
  if (lineIds.length === 0) return [];
  return db.select().from(forecastValues).where(inArray(forecastValues.forecastLineId, lineIds));
}

/**
 * Get revenue streams for a scenario's company.
 * Looks up the companyId from the scenario for backward compatibility.
 */
export const getRevenueStreams = cachedQuery(
  async (scenarioId: string) => {
    const [scenario] = await db.select({ companyId: scenarios.companyId }).from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
    if (!scenario) return [];
    return db.select().from(revenueStreams).where(eq(revenueStreams.companyId, scenario.companyId));
  },
  ["revenue-streams"],
  { revalidate: 30, tags: ["revenue-streams"] }
);

/**
 * Get headcount plans for a scenario's company.
 * Looks up the companyId from the scenario for backward compatibility.
 */
export const getHeadcountPlans = cachedQuery(
  async (scenarioId: string) => {
    const [scenario] = await db.select({ companyId: scenarios.companyId }).from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
    if (!scenario) return [];
    return db.select().from(headcountPlans).where(eq(headcountPlans.companyId, scenario.companyId));
  },
  ["headcount-plans"],
  { revalidate: 30, tags: ["headcount-plans"] }
);

/**
 * Get resolved salary changes / bonuses / equity grants for a list of
 * headcount IDs in a single batched call. Returned map is keyed by
 * headcountId. Used by the team page to show real child-row data.
 */
export async function getTeamChildEntitiesByHeadcount(
  companyId: string,
  scenarioId: string | null,
  headcountIds: string[],
): Promise<Map<string, {
  salaryChanges: ResolvedEntity<SalaryChange>[];
  bonuses: ResolvedEntity<Bonus>[];
  equityGrants: ResolvedEntity<EquityGrant>[];
}>> {
  const result = new Map<string, {
    salaryChanges: ResolvedEntity<SalaryChange>[];
    bonuses: ResolvedEntity<Bonus>[];
    equityGrants: ResolvedEntity<EquityGrant>[];
  }>();
  await Promise.all(
    headcountIds.map(async (id) => {
      const [salaryChanges, bonuses, equityGrants] = await Promise.all([
        listResolvedSalaryChanges(companyId, id, scenarioId),
        listResolvedBonuses(companyId, id, scenarioId),
        listResolvedEquityGrants(companyId, id, scenarioId),
      ]);
      result.set(id, { salaryChanges, bonuses, equityGrants });
    }),
  );
  return result;
}

/** Get departments for a company. */
export const getDepartments = cachedQuery(
  async (companyId: string) => {
    return db.select().from(departments).where(eq(departments.companyId, companyId));
  },
  ["departments"],
  { revalidate: 60, tags: ["departments"] }
);

/** Get funding rounds for a company. */
export const getFundingRounds = cachedQuery(
  async (companyId: string) => {
    return db.select().from(fundingRounds).where(eq(fundingRounds.companyId, companyId));
  },
  ["funding-rounds"],
  { revalidate: 30, tags: ["funding-rounds"] }
);

/** Get a scenario by ID. */
export const getScenarioById = cachedQuery(
  async (scenarioId: string) => {
    const [scenario] = await db.select().from(scenarios).where(and(eq(scenarios.id, scenarioId), isNull(scenarios.deletedAt)));
    return scenario ?? null;
  },
  ["scenario-by-id"],
  { revalidate: 30, tags: ["scenarios"] }
);

/**
 * Read the active scenario ID from the cookie for server components.
 * SSR is read-only rendering — single channel (cookie) is sufficient.
 */
export async function getServerScenarioId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("active-scenario-id")?.value;
}

/**
 * Get the active scenario for a page: uses scenarioId from searchParams
 * if present, otherwise falls back to the default scenario.
 */
export async function getActiveScenario(
  companyId: string,
  scenarioId?: string | null
) {
  if (scenarioId) {
    const s = await getScenarioById(scenarioId);
    if (s && s.companyId === companyId) return s;
  }
  return getDefaultScenario(companyId);
}

/**
 * @deprecated The overlay model has no "budget" concept. Remove callers.
 */
export const getBudgetScenario = cachedQuery(
  async (_companyId: string) => {
    return null;
  },
  ["budget-scenario"],
  { revalidate: 30, tags: ["scenarios"] }
);

/** Get transactions for a company. */
export async function getTransactions(companyId: string) {
  return db.select().from(transactions).where(eq(transactions.companyId, companyId));
}

/** Get dashboard preferences for the current user and company. */
export const getDashboardPreferences = cache(async function getDashboardPreferences() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await getCompanyForUser(session.user.id);
  if (!membership) return null;
  const [prefs] = await db
    .select()
    .from(dashboardPreferences)
    .where(
      and(
        eq(dashboardPreferences.userId, session.user.id),
        eq(dashboardPreferences.companyId, membership.companyId)
      )
    )
    .limit(1);
  return prefs ?? null;
});
