/**
 * Financial calculation utilities — date helpers, money math, period generation.
 * All monetary values are represented as numbers (cents or dollars depending on context).
 */

/** Generate an array of first-of-month dates between start and end (inclusive). */
export function monthRange(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/** Format a date as YYYY-MM for use as a map key. */
export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Parse a YYYY-MM key back to a first-of-month Date. */
export function parseMonthKey(key: string): Date {
  const parts = key.split("-").map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1;
  return new Date(y, m - 1, 1);
}

/** Round to 2 decimal places (standard financial rounding). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Check if a date falls within a month (inclusive of start, exclusive of end). */
export function isActiveInMonth(
  month: Date,
  startDate: Date,
  endDate: Date | null
): boolean {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0); // last day
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  if (start > monthEnd) return false;
  if (endDate) {
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    if (end < monthStart) return false;
  }
  return true;
}

/** Calculate prorated fraction of a month for a start/end date. Returns 0-1. */
export function proratedFraction(
  month: Date,
  startDate: Date,
  endDate: Date | null
): number {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const effectiveStart = startDate > monthStart ? startDate : monthStart;
  const effectiveEnd = endDate && endDate < monthEnd ? endDate : monthEnd;

  if (effectiveStart > effectiveEnd) return 0;

  const activeDays =
    Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return activeDays / daysInMonth;
}

/** Sum an array of numbers. */
export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** A monthly time series: month key -> value. */
export type MonthlySeries = Map<string, number>;

/** Create an empty monthly series for a date range. */
export function emptySeries(start: Date, end: Date): MonthlySeries {
  const series: MonthlySeries = new Map();
  for (const m of monthRange(start, end)) {
    series.set(monthKey(m), 0);
  }
  return series;
}

/** Add two series together (union of keys). */
export function addSeries(a: MonthlySeries, b: MonthlySeries): MonthlySeries {
  const result = new Map(a);
  for (const [k, v] of b) {
    result.set(k, (result.get(k) ?? 0) + v);
  }
  return result;
}

/** Subtract series b from series a. */
export function subtractSeries(a: MonthlySeries, b: MonthlySeries): MonthlySeries {
  const result = new Map(a);
  for (const [k, v] of b) {
    result.set(k, (result.get(k) ?? 0) - v);
  }
  return result;
}

/** Multiply every value in a series by a scalar. */
export function scaleSeries(s: MonthlySeries, factor: number): MonthlySeries {
  const result = new Map<string, number>();
  for (const [k, v] of s) {
    result.set(k, v * factor);
  }
  return result;
}

/** Convert a MonthlySeries to a sorted array of {month, value} objects. */
export function seriesToArray(s: MonthlySeries): { month: string; value: number }[] {
  return Array.from(s.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: round2(value) }));
}
