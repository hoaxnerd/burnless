export { formatCurrency } from "@burnless/types";
import { pctChange as pctChangeValue } from "@burnless/engine";

/** Formatted MoM percent string (e.g. "+10.5%"); null when there's no baseline.
 *  The numeric change comes from the engine — this only formats it. */
export function pctChange(current: number, previous: number): string | null {
  const pct = pctChangeValue(current, previous);
  if (pct === null) return null;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/** Extract last N values from a MetricValue array for sparklines.
 *  When upToMonth is provided, only includes data up to that month (inclusive)
 *  so the sparkline matches the MoM delta and doesn't include forecast data. */
export function sparkline(data: Array<{ month: string; value: number }>, n = 8, upToMonth?: string): number[] {
  const filtered = upToMonth ? data.filter((d) => d.month <= upToMonth) : data;
  return filtered.slice(-n).map((d) => d.value);
}
