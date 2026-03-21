"use client";

import { tooltipStyle, formatMonth, formatCompactCurrency } from "./chart-theme";

/**
 * Custom Recharts tooltip with MoM (month-over-month) delta display.
 * Format: "Mar 2026: $48,200 (+12.3% MoM)"
 */

interface MoMTooltipEntry {
  dataKey: string;
  label: string;
  color: string;
}

interface MoMTooltipProps {
  /** The full data array to look up previous month values */
  data: Array<Record<string, unknown>>;
  /** Series config — each entry maps a dataKey to its display label and color */
  entries: MoMTooltipEntry[];
  /** Value formatter */
  formatValue?: (value: number) => string;
  /** Month key used in data ("month" by default) */
  monthKey?: string;
  /* Recharts injected props */
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; payload: Record<string, unknown> }>;
  label?: string;
}

function computeMoMDelta(current: number, previous: number): string | null {
  if (previous === 0) return current > 0 ? "+∞" : null;
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  if (!isFinite(delta)) return null;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

export function MoMTooltipContent({
  data,
  entries,
  formatValue = formatCompactCurrency,
  monthKey = "month",
  active,
  payload,
  label,
}: MoMTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;

  // Find the index of the current data point
  const currentIndex = data.findIndex(
    (d) => String(d[monthKey]) === String(label)
  );
  const prevRow = currentIndex > 0 ? data[currentIndex - 1] : null;

  return (
    <div
      style={{
        ...tooltipStyle,
        minWidth: 140,
      }}
    >
      <div className="text-xs font-semibold text-surface-700 mb-1.5">
        {formatMonth(String(label))}
      </div>
      {payload.map((p) => {
        const entry = entries.find((e) => e.dataKey === p.dataKey);
        if (!entry) return null;
        const value = Number(p.value);
        const prevValue = prevRow ? Number(prevRow[p.dataKey] ?? 0) : null;
        const mom =
          prevValue !== null ? computeMoMDelta(value, prevValue) : null;

        return (
          <div
            key={p.dataKey}
            className="flex items-center justify-between gap-3 text-[11px] leading-5"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-surface-500">{entry.label}</span>
            </div>
            <div className="flex items-center gap-1.5 tabular-nums">
              <span className="font-semibold text-surface-800">
                {formatValue(value)}
              </span>
              {mom && (
                <span
                  className={`text-[10px] ${
                    mom.startsWith("+")
                      ? "text-success-500"
                      : mom.startsWith("-")
                        ? "text-danger-500"
                        : "text-surface-400"
                  }`}
                >
                  {mom} MoM
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Simplified MoM tooltip for single-value charts (AreaChart).
 */
interface SingleMoMTooltipProps {
  data: Array<{ month: string; value: number }>;
  color: string;
  seriesLabel?: string;
  formatValue?: (value: number) => string;
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
  label?: string;
}

export function SingleMoMTooltip({
  data,
  color,
  seriesLabel,
  formatValue = formatCompactCurrency,
  active,
  payload,
  label,
}: SingleMoMTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;

  const currentIndex = data.findIndex((d) => d.month === String(label));
  const currentValue = Number(payload[0]!.value);
  const prevValue =
    currentIndex > 0 ? data[currentIndex - 1]!.value : null;
  const mom =
    prevValue !== null ? computeMoMDelta(currentValue, prevValue) : null;

  return (
    <div style={{ ...tooltipStyle, minWidth: 120 }}>
      <div className="text-xs font-semibold text-surface-700 mb-1">
        {formatMonth(String(label))}
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-semibold text-surface-800 tabular-nums">
          {formatValue(currentValue)}
        </span>
        {mom && (
          <span
            className={`text-[10px] ${
              mom.startsWith("+")
                ? "text-success-500"
                : mom.startsWith("-")
                  ? "text-danger-500"
                  : "text-surface-400"
            }`}
          >
            {mom} MoM
          </span>
        )}
      </div>
      {seriesLabel && (
        <div className="text-[10px] text-surface-400 mt-0.5">
          {seriesLabel}
        </div>
      )}
    </div>
  );
}
