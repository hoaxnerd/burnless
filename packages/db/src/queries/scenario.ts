import { eq, and } from "drizzle-orm";
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
import { inArray } from "drizzle-orm";

/**
 * Verify a scenario belongs to a company and return it.
 * Returns the scenario row or null.
 */
export async function getScenarioForCompany(
  scenarioId: string,
  companyId: string,
) {
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, companyId)));
  return row ?? null;
}

/**
 * Get the default scenario for a company.
 */
export async function getDefaultScenario(companyId: string) {
  const [row] = await db
    .select()
    .from(scenarios)
    .where(
      and(eq(scenarios.companyId, companyId), eq(scenarios.isDefault, true)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Fetch all planning data for a scenario in parallel:
 * forecast lines, financial accounts, revenue streams, headcount plans.
 *
 * Use this for metrics, statements, and scenario comparison routes.
 */
export async function getScenarioData(scenarioId: string, companyId: string) {
  const [fLines, accounts, revStreams, hcPlans] = await Promise.all([
    db
      .select()
      .from(forecastLines)
      .where(eq(forecastLines.scenarioId, scenarioId)),
    db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.companyId, companyId)),
    db
      .select()
      .from(revenueStreams)
      .where(eq(revenueStreams.scenarioId, scenarioId)),
    db
      .select()
      .from(headcountPlans)
      .where(eq(headcountPlans.scenarioId, scenarioId)),
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
