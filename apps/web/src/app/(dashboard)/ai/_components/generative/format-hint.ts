"use client";
import { useLocale } from "@/components/locale/locale-context";

export type FormatHint = "currency" | "number" | "percent";

/** Returns a value→string formatter for a serializable format hint. */
export function useValueFormatter(format: FormatHint | undefined): (v: number) => string {
  const { fmtCompact, fmtCurrency } = useLocale();
  if (format === "currency") return (v: number) => fmtCurrency(v);
  if (format === "percent") return (v: number) => `${v.toFixed(1)}%`;
  return (v: number) => fmtCompact(v);
}
