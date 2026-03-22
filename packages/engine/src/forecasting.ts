/**
 * Forecasting engine — generates monthly projected values from forecast line definitions.
 *
 * Supports 5 methods:
 * - fixed: constant amount per month
 * - growth_rate: compound monthly growth from a base amount
 * - per_unit: units * price_per_unit, both can grow
 * - percentage_of: percentage of another forecast line's values
 * - custom_formula: simple expression evaluation
 */

import type { ForecastMethod } from "@burnless/types";
import { DependencyGraph, CircularDependencyError } from "./dag";
import {
  type MonthlySeries,
  monthRange,
  monthKey,
  round2,
  isActiveInMonth,
  toDate,
} from "./utils";
import { D, dPow, dRound2 } from "./decimal";
import {
  evaluateFormula,
  evaluateSimpleExpression as _evaluateSimpleExpression,
  type FormulaContext,
} from "./formula";

// Re-export the mathjs-based evaluateSimpleExpression for backward compatibility
export { evaluateSimpleExpression } from "./formula";

// ── Parameter types for each forecast method ─────────────────────────────────

export interface FixedParams {
  amount: number; // fixed monthly amount
}

export interface GrowthRateParams {
  baseAmount: number; // starting monthly amount
  monthlyGrowthRate: number; // e.g. 0.05 = 5% monthly growth
}

export interface PerUnitParams {
  units: number; // starting unit count
  pricePerUnit: number; // price per unit
  unitGrowthRate?: number; // monthly growth rate for units (default 0)
  priceGrowthRate?: number; // monthly growth rate for price (default 0)
}

export interface PercentageOfParams {
  sourceLineId: string; // ID of the forecast line to reference
  percentage: number; // e.g. 0.30 = 30%
}

export interface CustomFormulaParams {
  expression: string; // simple math expression
  variables?: Record<string, number>; // named constants
}

export type ForecastParams =
  | FixedParams
  | GrowthRateParams
  | PerUnitParams
  | PercentageOfParams
  | CustomFormulaParams;

// ── Forecast line input ──────────────────────────────────────────────────────

export interface ForecastLineInput {
  id: string;
  accountId: string;
  method: ForecastMethod;
  parameters: Record<string, unknown>;
  startDate: Date;
  endDate: Date | null;
  /** Pre-computed override values: month key -> amount */
  overrides?: Map<string, number>;
}

// ── Core forecasting functions ───────────────────────────────────────────────

/** Generate monthly values for a single forecast line. */
export function computeForecastLine(
  line: ForecastLineInput,
  periodStart: Date,
  periodEnd: Date,
  /** Resolved values from other lines, needed for percentage_of and custom_formula methods */
  resolvedLines?: Map<string, MonthlySeries>
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
  const allMonthKeys = months.map(monthKey);
  const series: MonthlySeries = new Map();

  for (let i = 0; i < months.length; i++) {
    const month = months[i]!;
    const key = monthKey(month);

    // Check if this line is active in this month
    if (!isActiveInMonth(month, line.startDate, line.endDate)) {
      series.set(key, 0);
      continue;
    }

    // Check for manual override
    if (line.overrides?.has(key)) {
      series.set(key, line.overrides.get(key)!);
      continue;
    }

    // Calculate months elapsed since this line's start
    const sd = toDate(line.startDate);
    const lineStart = new Date(sd.getFullYear(), sd.getMonth(), 1);
    const monthsElapsed = (month.getFullYear() - lineStart.getFullYear()) * 12
      + (month.getMonth() - lineStart.getMonth());

    const value = computeMonthValue(
      line.method,
      line.parameters,
      monthsElapsed,
      key,
      resolvedLines,
      allMonthKeys
    );
    series.set(key, round2(value));
  }

  return series;
}

function computeMonthValue(
  method: ForecastMethod,
  params: Record<string, unknown>,
  monthsElapsed: number,
  currentMonthKey: string,
  resolvedLines?: Map<string, MonthlySeries>,
  allMonthKeys?: string[]
): number {
  switch (method) {
    case "fixed": {
      const p = params as unknown as FixedParams;
      return p.amount ?? 0;
    }

    case "growth_rate": {
      const p = params as unknown as GrowthRateParams;
      if (p.baseAmount == null || p.monthlyGrowthRate == null) return 0;
      return D(p.baseAmount).mul(dPow(D(1).plus(p.monthlyGrowthRate), monthsElapsed)).toNumber();
    }

    case "per_unit": {
      const p = params as unknown as PerUnitParams;
      if (p.units == null || p.pricePerUnit == null) return 0;
      const units = D(p.units).mul(dPow(D(1).plus(p.unitGrowthRate ?? 0), monthsElapsed));
      const price = D(p.pricePerUnit).mul(dPow(D(1).plus(p.priceGrowthRate ?? 0), monthsElapsed));
      return units.mul(price).toNumber();
    }

    case "percentage_of": {
      const p = params as unknown as PercentageOfParams;
      if (!resolvedLines) return 0;
      const sourceSeries = resolvedLines.get(p.sourceLineId);
      if (!sourceSeries) return 0;
      const sourceValue = sourceSeries.get(currentMonthKey) ?? 0;
      if (p.percentage == null) return 0;
      return D(sourceValue).mul(p.percentage).toNumber();
    }

    case "custom_formula": {
      const p = params as unknown as CustomFormulaParams;
      if (!p.expression) return 0;
      const ctx: FormulaContext = {
        variables: {
          ...p.variables,
          month: monthsElapsed,
        },
        resolvedSeries: resolvedLines,
        currentMonthKey,
        allMonthKeys,
      };
      const result = evaluateFormula(p.expression, ctx);
      return result.value ?? 0;
    }

    default:
      return 0;
  }
}

/**
 * Compute all forecast lines for a scenario, handling dependencies.
 * Uses a dependency DAG to resolve arbitrarily deep chains and detect cycles.
 *
 * Dependency sources:
 * - percentage_of: references sourceLineId
 * - custom_formula: may reference other line IDs via variables
 *
 * Returns a map of line ID -> monthly series.
 * Throws CircularDependencyError if lines form a cycle.
 */
export function computeAllForecastLines(
  lines: ForecastLineInput[],
  periodStart: Date,
  periodEnd: Date
): Map<string, MonthlySeries> {
  const lineMap = new Map<string, ForecastLineInput>();
  for (const line of lines) {
    lineMap.set(line.id, line);
  }

  // Build dependency graph
  const graph = buildForecastDependencyGraph(lines);

  // Topological sort — throws CircularDependencyError on cycles
  const order = graph.topologicalSort();

  // Compute in dependency order
  const resolved = new Map<string, MonthlySeries>();
  for (const id of order) {
    const line = lineMap.get(id);
    if (!line) continue; // node existed in graph but not in lines (shouldn't happen)
    resolved.set(
      line.id,
      computeForecastLine(line, periodStart, periodEnd, resolved)
    );
  }

  return resolved;
}

/**
 * Build a dependency graph from forecast line definitions.
 * Extracts dependencies from percentage_of sourceLineId and custom_formula variables.
 */
export function buildForecastDependencyGraph(
  lines: ForecastLineInput[]
): DependencyGraph {
  const graph = new DependencyGraph();
  const lineIds = new Set(lines.map((l) => l.id));

  for (const line of lines) {
    graph.addNode(line.id);

    if (line.method === "percentage_of") {
      const params = line.parameters as unknown as PercentageOfParams;
      if (params.sourceLineId && lineIds.has(params.sourceLineId)) {
        graph.addDependency(line.id, params.sourceLineId);
      }
    }

    if (line.method === "custom_formula") {
      const params = line.parameters as unknown as CustomFormulaParams;
      // Variables that reference other line IDs create dependencies
      if (params.variables) {
        for (const varValue of Object.values(params.variables)) {
          // If a variable name matches a line ID, it's a dependency
          // (numeric values are constants, not references)
          if (typeof varValue === "string" && lineIds.has(varValue)) {
            graph.addDependency(line.id, varValue);
          }
        }
      }
    }
  }

  return graph;
}

/**
 * Aggregate forecast lines by account: account ID -> monthly series.
 * Multiple forecast lines for the same account are summed.
 */
export function aggregateByAccount(
  lines: ForecastLineInput[],
  lineValues: Map<string, MonthlySeries>
): Map<string, MonthlySeries> {
  const byAccount = new Map<string, MonthlySeries>();

  for (const line of lines) {
    const values = lineValues.get(line.id);
    if (!values) continue;

    const existing = byAccount.get(line.accountId);
    if (existing) {
      for (const [k, v] of values) {
        existing.set(k, D(existing.get(k) ?? 0).plus(v).toNumber());
      }
    } else {
      byAccount.set(line.accountId, new Map(values));
    }
  }

  return byAccount;
}

// Formula evaluation is now handled by ./formula.ts (mathjs-based sandboxed evaluator).
// The evaluateSimpleExpression function is re-exported at the top of this file.
