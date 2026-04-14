export { formatCurrency } from "@burnless/types";

export function pctChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/** Extract last N values from a MetricValue array for sparklines.
 *  When upToMonth is provided, only includes data up to that month (inclusive)
 *  so the sparkline matches the MoM delta and doesn't include forecast data. */
export function sparkline(data: Array<{ month: string; value: number }>, n = 8, upToMonth?: string): number[] {
  const filtered = upToMonth ? data.filter((d) => d.month <= upToMonth) : data;
  return filtered.slice(-n).map((d) => d.value);
}
