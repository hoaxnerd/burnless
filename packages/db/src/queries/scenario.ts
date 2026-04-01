import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "../index";
import {
  scenarios,
  forecastLines,
  forecastValues,
  financialAccounts,
  revenueStreams,
  headcountPlans,
  fundingRounds,
} from "../schema";

/** Reusable filter: only non-deleted scenarios. */
const notDeleted = isNull(scenarios.deletedAt);

/**
 * Verify a scenario belongs to a company and return it.
 * Returns the scenario row or null. Excludes soft-deleted.
 */
export async function getScenarioForCompany(
  scenarioId: string,
  companyId: string,
) {
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, companyId), notDeleted));
  return row ?? null;
}

/**
 * Get the first active scenario for a company.
 * In the overlay model there is no "default" scenario; this returns the first
 * non-deleted one, which callers use as a fallback when no specific scenario
 * is selected.
 */
export async function getDefaultScenario(companyId: string) {
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.companyId, companyId), notDeleted))
    .limit(1);
  return row ?? null;
}

/**
 * Fetch all base planning data for a company in parallel:
 * forecast lines, financial accounts, revenue streams, headcount plans.
 *
 * In the overlay model, base data is company-scoped (not scenario-scoped).
 * Use this for metrics, statements, and scenario comparison routes.
 */
export async function getScenarioData(scenarioId: string, companyId: string) {
  const [fLines, accounts, revStreams, hcPlans] = await Promise.all([
    db
      .select()
      .from(forecastLines)
      .where(eq(forecastLines.companyId, companyId)),
    db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.companyId, companyId)),
    db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.companyId, companyId)),
    db
      .select()
      .from(headcountPlans)
      .where(eq(headcountPlans.companyId, companyId)),
  ]);

  return { forecastLines: fLines, accounts, revenueStreams: revStreams, headcountPlans: hcPlans };
}

/**
 * Extended scenario data including forecast values and funding rounds.
 * Used by the statements route.
 */
export async function getScenarioDataWithValues(
  scenarioId: string,
  companyId: string,
) {
  const base = await getScenarioData(scenarioId, companyId);

  const lineIds = base.forecastLines.map((l) => l.id);
  const [values, funding] = await Promise.all([
    lineIds.length > 0
      ? db
          .select()
          .from(forecastValues)
          .where(inArray(forecastValues.forecastLineId, lineIds))
      : Promise.resolve([]),
    db
      .select()
      .from(fundingRounds)
      .where(eq(fundingRounds.companyId, companyId)),
  ]);

  return { ...base, forecastValues: values, fundingRounds: funding };
}
