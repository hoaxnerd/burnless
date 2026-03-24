export interface ScenarioOption {
  id: string;
  name: string;
  type: string;
}

export interface ComparisonLine {
  name: string;
  baseValues: { month: string; value: number }[];
  compareValues: { month: string; value: number }[];
  deltaAbsolute: { month: string; value: number }[];
  deltaPercent: { month: string; value: number }[];
}

export interface ComparisonData {
  baseScenario: { id: string; name: string };
  compareScenario: { id: string; name: string };
  lines: ComparisonLine[];
}

export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${Math.round(value)}`;
}

export function formatDelta(value: number, isCurrency: boolean): string {
  const sign = value >= 0 ? "+" : "";
  if (isCurrency) return `${sign}${formatCurrency(value)}`;
  return `${sign}${Math.round(value)}`;
}

export function formatMonth(monthKey: string): string {
  const parts = monthKey.split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "0";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1]} '${year.slice(2)}`;
}
