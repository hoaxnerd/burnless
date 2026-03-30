export { formatCurrency } from "@burnless/types";

export function pctChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/** Extract last N values from a MetricValue array for sparklines */
export function sparkline(data: Array<{ month: string; value: number }>, n = 8): number[] {
  return data.slice(-n).map((d) => d.value);
}
