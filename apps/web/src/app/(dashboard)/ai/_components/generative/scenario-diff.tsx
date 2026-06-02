"use client";
import { useValueFormatter, type FormatHint } from "./format-hint";

export interface GenScenarioDiffRow {
  label: string;
  a: number | null;
  b: number | null;
  delta: number | null;
  format?: FormatHint;
}

export interface GenScenarioDiffProps {
  aName: string;
  bName: string;
  rows: GenScenarioDiffRow[];
}

/** Format a single value via its row's format hint, or an em-dash when null. */
function DiffCell({ value, format }: { value: number | null; format?: FormatHint }) {
  const fmt = useValueFormatter(format);
  return (
    <span className="tabular-nums text-surface-700">
      {value === null ? "—" : fmt(value)}
    </span>
  );
}

/** The signed delta cell, colored by direction (up = positive, down = negative). */
function DeltaCell({ value, format }: { value: number | null; format?: FormatHint }) {
  const fmt = useValueFormatter(format);
  if (value === null) return <span className="text-surface-400">—</span>;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const tone =
    value > 0 ? "text-success-600" : value < 0 ? "text-danger-600" : "text-surface-500";
  return (
    <span className={`tabular-nums font-medium ${tone}`}>
      {sign}
      {fmt(Math.abs(value))}
    </span>
  );
}

export function GenScenarioDiff({ aName, bName, rows }: GenScenarioDiffProps) {
  if (!rows || rows.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
        No scenario comparison data available.
      </div>
    );
  }

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-surface-200">
      <table className="w-full text-xs">
        <thead className="bg-surface-50 border-b border-surface-200">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
              Metric
            </th>
            <th className="px-3 py-2 text-right font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
              {aName}
            </th>
            <th className="px-3 py-2 text-right font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
              {bName}
            </th>
            <th className="px-3 py-2 text-right font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
              Δ
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {rows.map((row, i) => (
            <tr key={`${row.label}-${i}`} className="hover:bg-surface-50/50 transition-colors">
              <td className="px-3 py-2 font-medium text-surface-800">{row.label}</td>
              <td className="px-3 py-2 text-right">
                <DiffCell value={row.a} format={row.format} />
              </td>
              <td className="px-3 py-2 text-right">
                <DiffCell value={row.b} format={row.format} />
              </td>
              <td className="px-3 py-2 text-right">
                <DeltaCell value={row.delta} format={row.format} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
