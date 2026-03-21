/**
 * Server-side data access layer. Used by server components to fetch data.
 *
 * DB queries are wrapped with unstable_cache for cross-request caching.
 * Cache tags allow targeted invalidation when data is mutated via API routes.
 */

import { db, getCompanyForUser } from "@burnless/db";
import {
  companies,
  scenarios,
  forecastLines,
  financialAccounts,
  revenueStreams,
  headcountPlans,
  transactions,
  departments,
  fundingRounds,
  dashboardPreferences,
} from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { auth } from "./auth";

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
 * Used by server component pages inside the (dashboard) layout.
 */
export async function getCompany() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getCompanyForAuthUser(session.user.id);
}

/** Get all scenarios for a company. */
export const getScenarios = unstable_cache(
  async (companyId: string) => {
    return db.select().from(scenarios).where(eq(scenarios.companyId, companyId)).orderBy(scenarios.createdAt);
  },
  ["scenarios"],
  { revalidate: 30, tags: ["scenarios"] }
);

/** Get the default (or first) scenario for a company. */
export const getDefaultScenario = unstable_cache(
  async (companyId: string) => {
    const rows = await db
      .select()
      .from(scenarios)
      .where(and(eq(scenarios.companyId, companyId), eq(scenarios.isDefault, true)))
      .limit(1);
    if (rows[0]) return rows[0];
    // Fallback to first scenario
    const [first] = await db.select().from(scenarios).where(eq(scenarios.companyId, companyId)).limit(1);
    return first ?? null;
  },
  ["default-scenario"],
  { revalidate: 30, tags: ["scenarios"] }
);

/** Get all financial accounts for a company. */
export const getAccounts = unstable_cache(
  async (companyId: string) => {
    return db.select().from(financialAccounts).where(eq(financialAccounts.companyId, companyId));
  },
  ["accounts"],
  { revalidate: 60, tags: ["accounts"] }
);

/** Get all forecast lines for a scenario. */
export const getForecastLines = unstable_cache(
  async (scenarioId: string) => {
    return db.select().from(forecastLines).where(eq(forecastLines.scenarioId, scenarioId));
  },
  ["forecast-lines"],
  { revalidate: 30, tags: ["forecast-lines"] }
);

/** Get revenue streams for a scenario. */
export const getRevenueStreams = unstable_cache(
  async (scenarioId: string) => {
    return db.select().from(revenueStreams).where(eq(revenueStreams.scenarioId, scenarioId));
  },
  ["revenue-streams"],
  { revalidate: 30, tags: ["revenue-streams"] }
);

/** Get headcount plans for a scenario. */
export const getHeadcountPlans = unstable_cache(
  async (scenarioId: string) => {
    return db.select().from(headcountPlans).where(eq(headcountPlans.scenarioId, scenarioId));
  },
  ["headcount-plans"],
  { revalidate: 30, tags: ["headcount-plans"] }
);

/** Get departments for a company. */
export const getDepartments = unstable_cache(
  async (companyId: string) => {
    return db.select().from(departments).where(eq(departments.companyId, companyId));
  },
  ["departments"],
  { revalidate: 60, tags: ["departments"] }
);

/** Get funding rounds for a company. */
export const getFundingRounds = unstable_cache(
  async (companyId: string) => {
    return db.select().from(fundingRounds).where(eq(fundingRounds.companyId, companyId));
  },
  ["funding-rounds"],
  { revalidate: 30, tags: ["funding-rounds"] }
);

/** Get a scenario by ID. */
export const getScenarioById = unstable_cache(
  async (scenarioId: string) => {
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId));
    return scenario ?? null;
  },
  ["scenario-by-id"],
  { revalidate: 30, tags: ["scenarios"] }
);

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

/** Get the budget scenario (isBudget=true) for a company. */
export const getBudgetScenario = unstable_cache(
  async (companyId: string) => {
    const [scenario] = await db
      .select()
      .from(scenarios)
      .where(and(eq(scenarios.companyId, companyId), eq(scenarios.isBudget, true)))
      .limit(1);
    return scenario ?? null;
  },
  ["budget-scenario"],
  { revalidate: 30, tags: ["scenarios"] }
);

/** Get transactions for a company. */
export async function getTransactions(companyId: string) {
  return db.select().from(transactions).where(eq(transactions.companyId, companyId));
}

/** Get dashboard preferences for the current user and company. */
export async function getDashboardPreferences() {
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
}
