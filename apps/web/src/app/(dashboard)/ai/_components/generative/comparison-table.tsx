"use client";

export interface GenComparisonColumn {
  key: string;
  label: string;
}

export interface GenComparisonTableProps {
  title?: string | null;
  columns: GenComparisonColumn[];
  rows: Array<Record<string, unknown>>;
}

/**
 * Presentational comparison table. Every cell is a model-authored string — this
 * renderer does no formatting and shows no financial data on its own. Table
 * classes mirror the data_table renderer for a consistent inline look.
 */
export function GenComparisonTable({ title, columns, rows }: GenComparisonTableProps) {
  if (!columns || columns.length === 0 || !rows || rows.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
        No comparison available.
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
                className="px-3 py-2 text-left font-semibold text-surface-600 uppercase tracking-wider text-[10px]"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-50/50 transition-colors">
              {columns.map((col) => {
                const value = row[col.key];
                return (
                  <td key={col.key} className="px-3 py-2 text-left text-surface-700">
                    {value === null || value === undefined ? "—" : String(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
