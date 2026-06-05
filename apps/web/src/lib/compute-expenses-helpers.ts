/**
 * Pure helpers extracted from compute-expenses.ts (Phase 1 §1.5 MANDATE):
 *  - shouldFlagAnomaly      — endDate-aware anomaly gate
 *  - getAnomalyBaseline     — frequency-aware baseline lookup
 *  - suggestRecurring       — variance-based recurring suggestion (replaces
 *                             the old isLowVariance helper; returns a structured
 *                             {likely, reason} the UI can display)
 *
 * These are intentionally I/O-free so vitest can exercise them without booting
 * the Next.js server or hitting Postgres.
 */

import { ratioChange } from "@burnless/engine";

export type ExpenseFrequency = "monthly" | "quarterly" | "annual";

export interface AnomalyContextLine {
  method: string;
  startDate: string;       // ISO YYYY-MM-DD
  endDate: string | null;  // ISO YYYY-MM-DD or null
  frequency: ExpenseFrequency;
}

const ANOMALY_THRESHOLD = 0.20;

/** Compute the baseline-month key for a given frequency. */
function baselineMonthKey(currentMonth: string, frequency: ExpenseFrequency): string {
  const [y, m] = currentMonth.split("-").map(Number) as [number, number];
  const offset = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const d = new Date(y, m - 1 - offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Look up the baseline value for anomaly comparison given the line's frequency.
 * monthly → t-1, quarterly → t-3, annual → t-12.
 */
export function getAnomalyBaseline(
  line: AnomalyContextLine,
  currentMonth: string,
  series: Map<string, number>,
): number {
  const key = baselineMonthKey(currentMonth, line.frequency);
  return series.get(key) ?? 0;
}

/**
 * Flag an anomaly only if:
 *   - current is NOT the month immediately after a known endDate
 *     (legitimate stream end isn't a 100% drop)
 *   - prev > 0  (no baseline ⇒ no anomaly)
 *   - |change| > threshold
 */
export function shouldFlagAnomaly(
  line: AnomalyContextLine,
  currentMonth: string,
  prevAmount: number,
  currentAmount: number,
): boolean {
  if (line.endDate) {
    const [ey, em] = line.endDate.split("-").map(Number) as [number, number, number];
    // First-of-month for the month immediately after endDate's month.
    const dayAfter = new Date(ey, em - 1 + 1, 1);
    const dayAfterKey = `${dayAfter.getFullYear()}-${String(dayAfter.getMonth() + 1).padStart(2, "0")}`;
    if (currentMonth === dayAfterKey) return false;
  }
  if (prevAmount <= 0) return false;
  const change = ratioChange(currentAmount, prevAmount) ?? 0;
  return Math.abs(change) > ANOMALY_THRESHOLD;
}

export interface RecurringSuggestion {
  likely: boolean;
  reason: string;
}

/**
 * Suggest whether a series of amounts looks recurring (low variance).
 * Returns a structured result so the UI can show *why* — only fires when the
 * line has no explicit user choice (`isRecurring IS NULL`).
 */
export function suggestRecurring(amounts: number[]): RecurringSuggestion {
  const positives = amounts.filter((v) => v > 0);
  if (positives.length < 3) return { likely: false, reason: "Sample too small" };
  const mean = positives.reduce((a, b) => a + b, 0) / positives.length;
  if (mean === 0) return { likely: false, reason: "All-zero values" };
  const variance =
    positives.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / positives.length;
  const cv = Math.sqrt(variance) / mean;
  return cv < 0.05
    ? { likely: true, reason: `Low coefficient of variation (${cv.toFixed(3)})` }
    : { likely: false, reason: `Variance too high (cv=${cv.toFixed(3)})` };
}
