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
import {
  type MonthlySeries,
  monthRange,
  monthKey,
  round2,
  isActiveInMonth,
} from "./utils";

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
  /** Resolved values from other lines, needed for percentage_of method */
  resolvedLines?: Map<string, MonthlySeries>
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
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
    const lineStart = new Date(line.startDate.getFullYear(), line.startDate.getMonth(), 1);
    const monthsElapsed = (month.getFullYear() - lineStart.getFullYear()) * 12
      + (month.getMonth() - lineStart.getMonth());

    const value = computeMonthValue(
      line.method,
      line.parameters,
      monthsElapsed,
      key,
      resolvedLines
    );
    series.set(key, round2(value));
  }

  return series;
}

function computeMonthValue(
  method: ForecastMethod,
  params: Record<string, unknown>,
  monthsElapsed: number,
  monthKey: string,
  resolvedLines?: Map<string, MonthlySeries>
): number {
  switch (method) {
    case "fixed": {
      const p = params as unknown as FixedParams;
      return p.amount;
    }

    case "growth_rate": {
      const p = params as unknown as GrowthRateParams;
      return p.baseAmount * Math.pow(1 + p.monthlyGrowthRate, monthsElapsed);
    }

    case "per_unit": {
      const p = params as unknown as PerUnitParams;
      const units = p.units * Math.pow(1 + (p.unitGrowthRate ?? 0), monthsElapsed);
      const price = p.pricePerUnit * Math.pow(1 + (p.priceGrowthRate ?? 0), monthsElapsed);
      return units * price;
    }

    case "percentage_of": {
      const p = params as unknown as PercentageOfParams;
      if (!resolvedLines) return 0;
      const sourceSeries = resolvedLines.get(p.sourceLineId);
      if (!sourceSeries) return 0;
      const sourceValue = sourceSeries.get(monthKey) ?? 0;
      return sourceValue * p.percentage;
    }

    case "custom_formula": {
      const p = params as unknown as CustomFormulaParams;
      return evaluateSimpleExpression(p.expression, {
        ...p.variables,
        month: monthsElapsed,
      });
    }

    default:
      return 0;
  }
}

/**
 * Compute all forecast lines for a scenario, handling dependencies (percentage_of).
 * Returns a map of line ID -> monthly series.
 */
export function computeAllForecastLines(
  lines: ForecastLineInput[],
  periodStart: Date,
  periodEnd: Date
): Map<string, MonthlySeries> {
  const resolved = new Map<string, MonthlySeries>();

  // First pass: compute all non-dependent lines
  const dependent: ForecastLineInput[] = [];
  for (const line of lines) {
    if (line.method === "percentage_of") {
      dependent.push(line);
    } else {
      resolved.set(line.id, computeForecastLine(line, periodStart, periodEnd));
    }
  }

  // Second pass: compute dependent lines (percentage_of)
  // Simple two-pass resolves single-level dependencies
  for (const line of dependent) {
    resolved.set(
      line.id,
      computeForecastLine(line, periodStart, periodEnd, resolved)
    );
  }

  return resolved;
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
        existing.set(k, (existing.get(k) ?? 0) + v);
      }
    } else {
      byAccount.set(line.accountId, new Map(values));
    }
  }

  return byAccount;
}

// ── Simple expression evaluator ──────────────────────────────────────────────

/**
 * Evaluate a simple mathematical expression with named variables.
 * Supports: +, -, *, /, parentheses, numbers, and variable names.
 * NOT a full-blown formula engine — just enough for custom forecast formulas.
 */
export function evaluateSimpleExpression(
  expr: string,
  vars: Record<string, number> = {}
): number {
  // Replace variable names with values
  let resolved = expr;
  for (const [name, value] of Object.entries(vars)) {
    resolved = resolved.replace(new RegExp(`\\b${escapeRegex(name)}\\b`, "g"), String(value));
  }

  // Validate: only allow numbers, operators, parentheses, whitespace, dots
  if (!/^[\d\s+\-*/().]+$/.test(resolved)) {
    return 0; // invalid expression
  }

  try {
    // Use Function constructor for safe math evaluation (no access to global scope)
    const fn = new Function(`"use strict"; return (${resolved});`);
    const result = fn();
    return typeof result === "number" && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
