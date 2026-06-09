/**
 * Financial calculation utilities — date helpers, money math, period generation.
 * All monetary values are represented as numbers (cents or dollars depending on context).
 * Internal arithmetic uses Decimal.js for precision; output is always plain numbers.
 */

import { D, dRound2, dSum } from "./decimal";

/** Coerce a Date-like value (Date, string, number) to a proper Date object.
 *  Handles the common case where Drizzle/PostgreSQL returns ISO strings instead of Date objects. */
export function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  // A bare 'YYYY-MM-DD' string parses as UTC midnight; west-of-UTC that shifts
  // back a day (and a month for first-of-month dates). Append a local-time
  // component so it constructs LOCAL midnight instead. (mirrors the types lane)
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value + "T00:00:00");
  }
  return new Date(value);
}

/** Generate an array of first-of-month dates between start and end (inclusive). */
export function monthRange(start: Date | string, end: Date | string): Date[] {
  const s = toDate(start);
  const e = toDate(end);
  const months: Date[] = [];
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  const last = new Date(e.getFullYear(), e.getMonth(), 1);
  while (cur <= last) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/** Format a date as YYYY-MM for use as a map key. */
export function monthKey(date: Date | string): string {
  const d = toDate(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Parse a YYYY-MM key back to a first-of-month Date. */
export function parseMonthKey(key: string): Date {
  const parts = key.split("-").map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1;
  return new Date(y, m - 1, 1);
}

/** The month immediately before `key` (YYYY-MM), rolling across year boundaries. */
export function previousMonthKey(key: string): string {
  const d = parseMonthKey(key);
  return monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

/**
 * Phase B carry-forward: extend a transaction-only account's actuals across the
 * forecast horizon so categories don't read 0 past the last imported month
 * (which would otherwise skew Gross Margin to 100% and make expenses look thin).
 *
 * Months at or before the last actual are preserved verbatim — gaps between
 * actuals are NOT interpolated. Every horizon month *after* the last actual is
 * filled with the trailing average of the last `trailingMonths` actual values
 * (a stable projection that tolerates a single noisy month). Leading months
 * before the first actual are left absent. The input series is not mutated.
 *
 * Month keys are "YYYY-MM" so lexicographic string comparison is chronological.
 */
export function projectActualsForward(
  actuals: MonthlySeries,
  horizonMonths: string[],
  trailingMonths = 3,
): MonthlySeries {
  const result = new Map(actuals);
  const actualKeys = Array.from(actuals.keys()).sort();
  if (actualKeys.length === 0) return result;
  const lastActual = actualKeys[actualKeys.length - 1]!;
  const tail = actualKeys.slice(-trailingMonths);
  const avg = tail.reduce((s, k) => s + (actuals.get(k) ?? 0), 0) / tail.length;
  for (const m of horizonMonths) {
    if (m > lastActual) result.set(m, avg);
  }
  return result;
}

/** Round to 2 decimal places (round half away from zero — standard financial rounding). */
export function round2(n: number): number {
  if (n == null || Number.isNaN(n)) return 0;
  return dRound2(n);
}

/** Check if a date falls within a month (inclusive of start, exclusive of end). */
export function isActiveInMonth(
  month: Date | string,
  startDate: Date | string,
  endDate: Date | string | null
): boolean {
  const m = toDate(month);
  const sd = toDate(startDate);
  const monthStart = new Date(m.getFullYear(), m.getMonth(), 1);
  const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0); // last day
  const start = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
  if (start > monthEnd) return false;
  if (endDate) {
    const ed = toDate(endDate);
    const end = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate());
    if (end < monthStart) return false;
  }
  return true;
}

/** Calculate prorated fraction of a month for a start/end date. Returns 0-1. */
export function proratedFraction(
  month: Date | string,
  startDate: Date | string,
  endDate: Date | string | null
): number {
  const m = toDate(month);
  const sdRaw = toDate(startDate);
  // Normalize to local midnight to avoid UTC-vs-local skew when comparing
  const sd = new Date(sdRaw.getFullYear(), sdRaw.getMonth(), sdRaw.getDate());
  const monthStart = new Date(m.getFullYear(), m.getMonth(), 1);
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);

  const effectiveStart = sd > monthStart ? sd : monthStart;
  const edRaw = endDate ? toDate(endDate) : null;
  const ed = edRaw ? new Date(edRaw.getFullYear(), edRaw.getMonth(), edRaw.getDate()) : null;
  const effectiveEnd = ed && ed < monthEnd ? ed : monthEnd;

  if (effectiveStart > effectiveEnd) return 0;

  const activeDays =
    Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return activeDays / daysInMonth;
}

/** Sum an array of numbers using Decimal for precision. */
export function sum(values: number[]): number {
  return dSum(values);
}

/** A monthly time series: month key -> value. */
export type MonthlySeries = Map<string, number>;

/**
 * FMT-2: safe read of a single month from a series. Returns 0 when the month is
 * absent (or the value is nullish), so callers never propagate `undefined`.
 */
export function valueAtMonth(series: MonthlySeries, month: string): number {
  return series.get(month) ?? 0;
}

/** Create an empty monthly series for a date range. */
export function emptySeries(start: Date | string, end: Date | string): MonthlySeries {
  const series: MonthlySeries = new Map();
  for (const m of monthRange(start, end)) {
    series.set(monthKey(m), 0);
  }
  return series;
}

/** Add two series together (union of keys). Uses Decimal to prevent float drift. */
export function addSeries(a: MonthlySeries, b: MonthlySeries): MonthlySeries {
  const result = new Map(a);
  for (const [k, v] of b) {
    result.set(k, D(result.get(k) ?? 0).plus(v).toNumber());
  }
  return result;
}

/** Subtract series b from series a. Uses Decimal to prevent float drift. */
export function subtractSeries(a: MonthlySeries, b: MonthlySeries): MonthlySeries {
  const result = new Map(a);
  for (const [k, v] of b) {
    result.set(k, D(result.get(k) ?? 0).minus(v).toNumber());
  }
  return result;
}

/** Multiply every value in a series by a scalar. Uses Decimal to prevent float drift. */
export function scaleSeries(s: MonthlySeries, factor: number): MonthlySeries {
  const result = new Map<string, number>();
  for (const [k, v] of s) {
    result.set(k, D(v).mul(factor).toNumber());
  }
  return result;
}

/** Convert a MonthlySeries to a sorted array of {month, value} objects. */
export function seriesToArray(s: MonthlySeries): { month: string; value: number }[] {
  return Array.from(s.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: round2(value) }));
}
