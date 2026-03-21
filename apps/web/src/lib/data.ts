/**
 * Server-side data access layer. Used by server components to fetch data.
 * For MVP: works with or without auth. Falls back to first company.
 */

import { db } from "@burnless/db";
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
} from "@burnless/db";
import { eq, and } from "drizzle-orm";

/** Get the first company (MVP: single-tenant). */
export async function getCompany() {
  const [company] = await db.select().from(companies).limit(1);
  return company ?? null;
}

/** Get all scenarios for a company. */
export async function getScenarios(companyId: string) {
  return db.select().from(scenarios).where(eq(scenarios.companyId, companyId)).orderBy(scenarios.createdAt);
}

/** Get the default (or first) scenario for a company. */
export async function getDefaultScenario(companyId: string) {
  const rows = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.companyId, companyId), eq(scenarios.isDefault, true)))
    .limit(1);
  if (rows[0]) return rows[0];
  // Fallback to first scenario
  const [first] = await db.select().from(scenarios).where(eq(scenarios.companyId, companyId)).limit(1);
  return first ?? null;
}

/** Get all financial accounts for a company. */
export async function getAccounts(companyId: string) {
  return db.select().from(financialAccounts).where(eq(financialAccounts.companyId, companyId));
}

/** Get all forecast lines for a scenario. */
export async function getForecastLines(scenarioId: string) {
  return db.select().from(forecastLines).where(eq(forecastLines.scenarioId, scenarioId));
}

/** Get revenue streams for a scenario. */
export async function getRevenueStreams(scenarioId: string) {
  return db.select().from(revenueStreams).where(eq(revenueStreams.scenarioId, scenarioId));
}

/** Get headcount plans for a scenario. */
export async function getHeadcountPlans(scenarioId: string) {
  return db.select().from(headcountPlans).where(eq(headcountPlans.scenarioId, scenarioId));
}

/** Get departments for a company. */
export async function getDepartments(companyId: string) {
  return db.select().from(departments).where(eq(departments.companyId, companyId));
}

/** Get funding rounds for a company. */
export async function getFundingRounds(companyId: string) {
  return db.select().from(fundingRounds).where(eq(fundingRounds.companyId, companyId));
}

/** Get a scenario by ID. */
export async function getScenarioById(scenarioId: string) {
  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId));
  return scenario ?? null;
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

/** Get the budget scenario (isBudget=true) for a company. */
export async function getBudgetScenario(companyId: string) {
  const [scenario] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.companyId, companyId), eq(scenarios.isBudget, true)))
    .limit(1);
  return scenario ?? null;
}

/** Get transactions for a company. */
export async function getTransactions(companyId: string) {
  return db.select().from(transactions).where(eq(transactions.companyId, companyId));
}
