"use client";
import { useValueFormatter, type FormatHint } from "./format-hint";

export interface GenMetricCardProps {
  label: string;
  value: number | null;
  format?: FormatHint;
  unit?: string;
}

export function GenMetricCard({ label, value, format, unit }: GenMetricCardProps) {
  const fmt = useValueFormatter(format);
  return (
    <div className="my-2 inline-flex min-w-[160px] flex-col rounded-xl border border-surface-200 bg-surface-0 px-4 py-3">
      <span className="text-xs font-medium text-surface-500">{label}</span>
      <span className="mt-1 text-2xl font-semibold text-surface-900">
        {value === null ? "—" : fmt(value)}
        {unit && value !== null ? (
          <span className="ml-1 text-sm font-normal text-surface-500">{unit}</span>
        ) : null}
      </span>
    </div>
  );
}
