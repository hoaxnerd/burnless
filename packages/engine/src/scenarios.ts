/**
 * Scenario comparison engine — delta analysis between two financial scenarios.
 */

import { type MonthlySeries, round2, seriesToArray } from "./utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScenarioData {
  id: string;
  name: string;
  /** Account-level monthly data: accountId -> MonthlySeries */
  accounts: Map<string, MonthlySeries>;
  /** Aggregate series (revenue, expenses, net income, cash, etc.) */
  aggregates: {
    revenue: MonthlySeries;
    expenses: MonthlySeries;
    netIncome: MonthlySeries;
    cashPosition: MonthlySeries;
    headcount: MonthlySeries;
  };
}

export interface ComparisonLine {
  name: string;
  baseValues: { month: string; value: number }[];
  compareValues: { month: string; value: number }[];
  deltaAbsolute: { month: string; value: number }[];
  deltaPercent: { month: string; value: number }[];
}

export interface ScenarioComparison {
  baseScenario: string;
  compareScenario: string;
  revenue: ComparisonLine;
  expenses: ComparisonLine;
  netIncome: ComparisonLine;
  cashPosition: ComparisonLine;
  headcount: ComparisonLine;
  /** Per-account comparisons */
  accountComparisons: Map<string, ComparisonLine>;
}

// ── Core comparison function ─────────────────────────────────────────────────

/** Compare two scenarios across all aggregate metrics and accounts. */
export function compareScenarios(
  base: ScenarioData,
  compare: ScenarioData
): ScenarioComparison {
  const accountComparisons = new Map<string, ComparisonLine>();

  // Compare at account level for all accounts in either scenario
  const allAccountIds = new Set([
    ...base.accounts.keys(),
    ...compare.accounts.keys(),
  ]);

  for (const accountId of allAccountIds) {
    const baseSeries = base.accounts.get(accountId) ?? new Map();
    const compareSeries = compare.accounts.get(accountId) ?? new Map();
    accountComparisons.set(
      accountId,
      buildComparisonLine(accountId, baseSeries, compareSeries)
    );
  }

  return {
    baseScenario: base.name,
    compareScenario: compare.name,
    revenue: buildComparisonLine("Revenue", base.aggregates.revenue, compare.aggregates.revenue),
    expenses: buildComparisonLine("Expenses", base.aggregates.expenses, compare.aggregates.expenses),
    netIncome: buildComparisonLine("Net Income", base.aggregates.netIncome, compare.aggregates.netIncome),
    cashPosition: buildComparisonLine("Cash Position", base.aggregates.cashPosition, compare.aggregates.cashPosition),
    headcount: buildComparisonLine("Headcount", base.aggregates.headcount, compare.aggregates.headcount),
    accountComparisons,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildComparisonLine(
  name: string,
  baseSeries: MonthlySeries,
  compareSeries: MonthlySeries
): ComparisonLine {
  const allMonths = Array.from(
    new Set([...baseSeries.keys(), ...compareSeries.keys()])
  ).sort();

  const baseValues: { month: string; value: number }[] = [];
  const compareValues: { month: string; value: number }[] = [];
  const deltaAbsolute: { month: string; value: number }[] = [];
  const deltaPercent: { month: string; value: number }[] = [];

  for (const month of allMonths) {
    const bVal = baseSeries.get(month) ?? 0;
    const cVal = compareSeries.get(month) ?? 0;
    const delta = round2(cVal - bVal);
    const pct = bVal !== 0 ? round2((delta / Math.abs(bVal)) * 100) : 0;

    baseValues.push({ month, value: round2(bVal) });
    compareValues.push({ month, value: round2(cVal) });
    deltaAbsolute.push({ month, value: delta });
    deltaPercent.push({ month, value: pct });
  }

  return { name, baseValues, compareValues, deltaAbsolute, deltaPercent };
}
