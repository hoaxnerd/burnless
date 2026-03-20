/**
 * Shared chart theme — consistent colors, typography, and styling for all Recharts visuals.
 */

export const chartColors = {
  brand: "#2563eb", // brand-600
  brandLight: "#93bbfd",
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#f59e0b",
  info: "#0ea5e9",
  gray: "#94a3b8",
  grayLight: "#e2e8f0",
  // Palette for multi-line charts
  palette: [
    "#2563eb", // blue
    "#7c3aed", // violet
    "#0ea5e9", // sky
    "#16a34a", // green
    "#f59e0b", // amber
    "#dc2626", // red
    "#ec4899", // pink
    "#14b8a6", // teal
  ],
} as const;

export const chartDefaults = {
  strokeWidth: 2,
  dotRadius: 0,
  activeDotRadius: 4,
  gridStroke: "#f1f5f9",
  axisStroke: "#94a3b8",
  fontSize: 11,
  fontFamily: "inherit",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e2e8f0",
  animationDuration: 300,
} as const;

export function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
}

/** Format month key (YYYY-MM) to short display (Jan, Feb, etc.) */
export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short" });
}

/** Format month key to longer display (Jan 2026) */
export function formatMonthYear(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
