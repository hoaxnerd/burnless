/**
 * Shared chart theme — consistent colors, typography, and styling for all Recharts visuals.
 * Formatting functions are locale-aware via @burnless/types.
 */

import {
  formatCurrency as fmtCurrency,
  formatCompactAmount,
  formatMonthKey,
  formatPercent as fmtPercent,
  formatNumber as fmtNumber,
  type CurrencyCode,
} from "@burnless/types";

export const chartColors = {
  brand: "#2563eb", // --color-brand-600
  brandLight: "#93bbfd",
  success: "#10b981", // --color-success-500
  danger: "#ef4444", // --color-danger-500
  warning: "#f59e0b", // --color-warning-500
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
  activeDotRadius: 5,
  gridStroke: "#f1f5f9",
  axisStroke: "#94a3b8",
  fontSize: 11,
  fontFamily: "inherit",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e5e7eb",
  animationDuration: 400,
  animationEasing: "ease-out" as const,
} as const;

/**
 * Format a monetary value in compact form (e.g., "$1.2M", "₹10L").
 * Falls back to USD/en-US when no currency/locale provided.
 */
export function formatCompactCurrency(
  value: number,
  currency: CurrencyCode = "USD",
  locale?: string
): string {
  return formatCompactAmount(value, currency, locale);
}

/**
 * Format a monetary value in full form using Intl.NumberFormat.
 */
export function formatFullCurrency(
  value: number,
  currency: CurrencyCode = "USD",
  locale?: string
): string {
  return fmtCurrency(value, currency, locale);
}

export function formatPercent(value: number, locale?: string): string {
  return fmtPercent(value, locale);
}

export function formatNumber(
  value: number,
  locale?: string,
  options?: { compact?: boolean }
): string {
  return fmtNumber(value, locale, { compact: options?.compact ?? true });
}

/** Format month key (YYYY-MM) to short display (Jan, Feb, etc.) */
export function formatMonth(monthKey: string, locale?: string): string {
  return formatMonthKey(monthKey, locale);
}

/** Format month key to longer display (Jan 2026) */
export function formatMonthYear(monthKey: string, locale?: string): string {
  return formatMonthKey(monthKey, locale, { includeYear: true });
}

/** Tooltip styling — CRED-tier with backdrop blur effect */
export const tooltipStyle = {
  background: "rgba(255, 255, 255, 0.95)",
  backdropFilter: "blur(8px)",
  border: `1px solid ${chartDefaults.tooltipBorder}`,
  borderRadius: 12,
  fontSize: chartDefaults.fontSize,
  boxShadow: "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
  padding: "8px 12px",
} as const;
