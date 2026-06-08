"use client";
import { useLocale } from "@/components/locale/locale-context";

export type FormatHint = "currency" | "number" | "percent";

/** Returns a value→string formatter for a serializable format hint. */
export function useValueFormatter(format: FormatHint | undefined): (v: number) => string {
  const { fmtNumber, fmtCurrency, fmtPercent } = useLocale();
  if (format === "currency") return (v: number) => fmtCurrency(v);
  if (format === "percent") return (v: number) => fmtPercent(v, 1);
  // Plain number: locale-aware, keep up to one decimal for non-integers
  // (runway/ratio metrics). fmtCompact is a CURRENCY formatter (adds a symbol),
  // so it must not be used for the "number" hint.
  return (v: number) => fmtNumber(v, { decimals: Number.isInteger(v) ? 0 : 1 });
}
