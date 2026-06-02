"use client";
import { useValueFormatter } from "./format-hint";

export interface GenCapTableRow {
  holder: string;
  shares: number;
  pctOwnership: number; // 0-100
  shareClass: string;
}

export interface GenCapTableProps {
  rows: GenCapTableRow[];
  totalShares: number;
}

export function GenCapTable({ rows, totalShares }: GenCapTableProps) {
  const fmtPercent = useValueFormatter("percent");
  const fmtNumber = useValueFormatter("number");

  if (!rows || rows.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
        No cap table data available.
      </div>
    );
  }

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-surface-200">
      <table className="w-full text-xs">
        <thead className="bg-surface-50 border-b border-surface-200">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
              Holder
            </th>
            <th className="px-3 py-2 text-left font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
              Class
            </th>
            <th className="px-3 py-2 text-right font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
              Shares
            </th>
            <th className="px-3 py-2 text-right font-semibold text-surface-600 uppercase tracking-wider text-[10px]">
              Ownership
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {rows.map((row, i) => (
            <tr key={`${row.holder}-${i}`} className="hover:bg-surface-50/50 transition-colors">
              <td className="px-3 py-2 font-medium text-surface-800">{row.holder}</td>
              <td className="px-3 py-2 text-surface-600">{row.shareClass}</td>
              <td className="px-3 py-2 text-right tabular-nums text-surface-700">
                {fmtNumber(row.shares)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-surface-700">
                {fmtPercent(row.pctOwnership)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-surface-200 bg-surface-50">
          <tr>
            <td className="px-3 py-2 font-semibold text-surface-700" colSpan={2}>
              Total (fully diluted)
            </td>
            <td className="px-3 py-2 text-right font-semibold tabular-nums text-surface-800">
              {fmtNumber(totalShares)}
            </td>
            <td className="px-3 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
