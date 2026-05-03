/**
 * Typed allowlist of `scenario_overrides.entity_type` values.
 *
 * The resolver (`resolveEntities`) and mutation helpers (`scenarioInsert`,
 * `scenarioUpdate`, `scenarioDelete`) accept any string for backward
 * compatibility, but every production caller should use this list. Promotion
 * (`scenario-promotion.ts`) requires every entity type to map to a Drizzle
 * table — keep that map in sync with this list.
 */
export const SCENARIO_ENTITY_TYPES = [
  "revenue_stream",
  "transaction",
  "forecast_line",
  "headcount_plan",
  "funding_round",
  "department",
  "financial_account",
  "salary_change",
  "bonus",
  "equity_grant",
] as const;

export type ScenarioEntityType = (typeof SCENARIO_ENTITY_TYPES)[number];
