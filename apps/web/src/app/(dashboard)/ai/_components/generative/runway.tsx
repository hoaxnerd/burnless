"use client";
import { useValueFormatter, type FormatHint } from "./format-hint";

export interface GenRunwayProps {
  runwayMonths: number | null;
  netBurn: number | null;
  cash: number | null;
  zeroCashMonth: string | null;
  format?: FormatHint;
}

/** Horizontal bar fill clamped to a 0–24 month window. */
function barPct(months: number | null): number {
  if (months === null || !Number.isFinite(months)) return 0;
  return Math.max(0, Math.min(100, (months / 24) * 100));
}

export function GenRunway({ runwayMonths, netBurn, cash, zeroCashMonth, format }: GenRunwayProps) {
  const fmtCurrency = useValueFormatter(format ?? "currency");
  const fmtMonths = useValueFormatter("number");
  const hasData = runwayMonths !== null;

  return (
    <div className="my-2 max-w-sm rounded-xl border border-surface-200 bg-surface-0 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-surface-500">Runway</span>
        {zeroCashMonth ? (
          <span className="text-xs text-surface-500">cash-out: {zeroCashMonth}</span>
        ) : null}
      </div>

      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-semibold text-surface-900">
          {hasData ? fmtMonths(runwayMonths!) : "—"}
        </span>
        {hasData ? <span className="text-sm font-normal text-surface-500">months</span> : null}
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-100">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${barPct(runwayMonths)}%` }}
        />
      </div>

      <div className="mt-3 flex justify-between text-xs text-surface-500">
        <span>
          Net burn:{" "}
          <span className="font-medium text-surface-700">
            {netBurn === null ? "—" : fmtCurrency(netBurn)}
          </span>
        </span>
        <span>
          Cash:{" "}
          <span className="font-medium text-surface-700">
            {cash === null ? "—" : fmtCurrency(cash)}
          </span>
        </span>
      </div>
    </div>
  );
}
