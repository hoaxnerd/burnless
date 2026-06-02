"use client";
import { useValueFormatter, type FormatHint } from "./format-hint";

export interface GenDataTableColumn {
  key: string;
  label: string;
  /** When set, numeric cells in this column route through the matching formatter. */
  format?: FormatHint;
}

export interface GenDataTableProps {
  title?: string;
  columns: GenDataTableColumn[];
  rows: Array<Record<string, unknown>>;
}

/** Renders one cell — numeric values with a column `format` go through the formatter. */
function Cell({
  value,
  format,
  formatters,
}: {
  value: unknown;
  format: FormatHint | undefined;
  formatters: { currency: (v: number) => string; number: (v: number) => string; percent: (v: number) => string };
}) {
  if (value === null || value === undefined) return <>—</>;
  if (format && typeof value === "number") return <>{formatters[format](value)}</>;
  if (typeof value === "number") return <>{formatters.number(value)}</>;
  return <>{String(value)}</>;
}

export function GenDataTable({ title, columns, rows }: GenDataTableProps) {
  // Hooks are unconditional; build one formatter per hint and pick per-cell.
  const formatters = {
    currency: useValueFormatter("currency"),
    number: useValueFormatter("number"),
    percent: useValueFormatter("percent"),
  };

  if (!columns || columns.length === 0 || !rows || rows.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
        No data available.
      </div>
    );
  }

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-surface-200">
      {title ? (
        <div className="border-b border-surface-200 bg-surface-50 px-3 py-2 text-xs font-semibold text-surface-700">
          {title}
        </div>
      ) : null}
      <table className="w-full text-xs">
        <thead className="bg-surface-50 border-b border-surface-200">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-semibold text-surface-600 uppercase tracking-wider text-[10px] ${
                  col.format ? "text-right" : "text-left"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-50/50 transition-colors">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 text-surface-700 ${
                    col.format ? "text-right tabular-nums" : "text-left font-medium text-surface-800"
                  }`}
                >
                  <Cell value={row[col.key]} format={col.format} formatters={formatters} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
