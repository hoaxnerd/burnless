export interface ScenarioOption {
  id: string;
  name: string;
  source: string;
}

export interface ComparisonLine {
  name: string;
  baseValues: { month: string; value: number }[];
  compareValues: { month: string; value: number }[];
  deltaAbsolute: { month: string; value: number }[];
  deltaPercent: { month: string; value: number }[];
}

export interface DataDiffItem {
  id: string;
  entityId: string;
  action: "modify" | "create" | "delete";
  data: Record<string, unknown>;
  originalData?: Record<string, unknown>;
}

export interface DataDiffGroup {
  entityType: string;
  items: DataDiffItem[];
}

export interface DataDiff {
  summary: { modified: number; created: number; deleted: number; total: number };
  groups: DataDiffGroup[];
}

export interface ComparisonData {
  baseScenario: { id: string; name: string };
  compareScenario: { id: string; name: string };
  lines: ComparisonLine[];
  dataDiff?: DataDiff;
}

import { formatCurrency } from "@burnless/types";
export { formatCurrency };

export function formatDelta(value: number, isCurrency: boolean): string {
  const sign = value >= 0 ? "+" : "";
  if (isCurrency) return `${sign}${formatCurrency(value, "USD", undefined, { compact: true })}`;
  return `${sign}${Math.round(value)}`;
}

export function formatMonth(monthKey: string): string {
  const parts = monthKey.split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "0";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1]} '${year.slice(2)}`;
}
