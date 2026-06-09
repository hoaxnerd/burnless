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
  ALLOWED_FUNCTIONS,
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
  /** Sanitized line name (`^[A-Za-z_][A-Za-z0-9_]*$`); custom_formula expressions
   *  reference other lines by this name. (Phase 4 §4.3) */
  name?: string | null;
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
  /** Resolved values from other lines keyed by line id — used by percentage_of (sourceLineId). */
  resolvedLines?: Map<string, MonthlySeries>,
  /** Resolved values from other lines keyed by line NAME — used by custom_formula cross-line refs. (Phase 4 §4.3) */
  resolvedByName?: Map<string, MonthlySeries>
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
      allMonthKeys,
      resolvedByName
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
  allMonthKeys?: string[],
  resolvedByName?: Map<string, MonthlySeries>
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
        // Explicit named constants first; `month` injected LAST so it always wins. (Phase 4 §4.3)
        variables: {
          ...p.variables,
          month: monthsElapsed,
        },
        // custom_formula references other lines by NAME, so the name-keyed view is the series source.
        resolvedSeries: resolvedByName,
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

  // id → name map for building the name-keyed view consumed by custom_formula. (Phase 4 §4.3)
  const idToName = new Map<string, string>();
  for (const line of lines) {
    if (line.name) idToName.set(line.id, line.name);
  }

  // Compute in dependency order
  const resolved = new Map<string, MonthlySeries>();
  for (const id of order) {
    const line = lineMap.get(id);
    if (!line) continue; // node existed in graph but not in lines (shouldn't happen)
    // Name-keyed view of everything resolved so far (DAG order guarantees sources are present).
    const resolvedByName = new Map<string, MonthlySeries>();
    for (const [resolvedId, series] of resolved) {
      const name = idToName.get(resolvedId);
      if (name) resolvedByName.set(name, series);
    }
    resolved.set(
      line.id,
      computeForecastLine(line, periodStart, periodEnd, resolved, resolvedByName)
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

  // name → id, for resolving custom_formula identifier tokens to source line ids. (Phase 4 §4.3)
  const nameToId = new Map<string, string>();
  for (const line of lines) {
    if (line.name) nameToId.set(line.name, line.id);
  }

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
      if (!params.expression) continue;
      // Extract bare identifiers from the expression; any that map to another
      // line's NAME becomes a dependency edge dependent→source. Function names,
      // pi/e/month, and declared `variables` keys are NOT line references. (Phase 4 §4.3)
      const declaredVars = new Set(Object.keys(params.variables ?? {}));
      for (const token of extractIdentifiers(params.expression)) {
        if (declaredVars.has(token)) continue;
        const srcId = nameToId.get(token);
        if (srcId && srcId !== line.id) {
          graph.addDependency(line.id, srcId);
        }
      }
    }
  }

  return graph;
}

/**
 * Extract bare (flat, single-segment) identifier tokens from a formula expression.
 * Mirrors the flat-identifier matcher in `formula.ts:resolveFlatVars`: matches
 * identifiers NOT immediately followed by `.`, `[`, or `(` (those are dotted refs,
 * time-offset refs, or function calls). Skips ALLOWED_FUNCTIONS and the reserved
 * `pi`/`e`/`month` names so only potential line-name references remain. (Phase 4 §4.3)
 */
function extractIdentifiers(expression: string): string[] {
  const pattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b(?![.\[(])/g;
  const reserved = new Set(["pi", "e", "month"]);
  const out = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(expression)) !== null) {
    const name = match[1]!;
    const lower = name.toLowerCase();
    if (ALLOWED_FUNCTIONS.has(lower)) continue;
    if (reserved.has(lower)) continue;
    out.add(name);
  }
  return [...out];
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
