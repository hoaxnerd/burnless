"use client";

import type { ComparisonLine } from "./comparison-types";
import { formatCurrency, formatDelta } from "./comparison-types";

export function ComparisonRow({
  line,
  baseName,
  compareName,
  isCurrency,
}: {
  line: ComparisonLine;
  baseName: string;
  compareName: string;
  isCurrency: boolean;
}) {
  const fmt = (v: number) =>
    isCurrency ? formatCurrency(v, "USD", undefined, { compact: true }) : String(Math.round(v));

  return (
    <>
      {/* Base values */}
      <tr className="border-t border-surface-100">
        <td
          className="px-4 py-2 text-xs font-semibold text-surface-900 sticky left-0 bg-surface-0"
          rowSpan={3}
        >
          {line.name}
        </td>
        <td className="px-4 py-2 text-xs text-surface-500">{baseName}</td>
        {line.baseValues.map((v) => (
          <td key={v.month} className="text-right px-3 py-2 text-xs text-surface-700 whitespace-nowrap">
            {fmt(v.value)}
          </td>
        ))}
      </tr>
      {/* Compare values */}
      <tr className="border-t border-surface-50">
        <td className="px-4 py-2 text-xs text-surface-500">{compareName}</td>
        {line.compareValues.map((v) => (
          <td key={v.month} className="text-right px-3 py-2 text-xs text-surface-700 whitespace-nowrap">
            {fmt(v.value)}
          </td>
        ))}
      </tr>
      {/* Delta */}
      <tr className="border-t border-surface-50 bg-surface-50/50">
        <td className="px-4 py-2 text-xs text-surface-400 italic">Delta</td>
        {line.deltaAbsolute.map((d, i) => {
          const pct = line.deltaPercent[i]?.value ?? 0;
          const positive = line.name !== "Expenses" ? d.value >= 0 : d.value <= 0;
          return (
            <td
              key={d.month}
              className={`text-right px-3 py-2 text-xs font-medium whitespace-nowrap ${
                d.value === 0
                  ? "text-surface-400"
                  : positive
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              <span className="sr-only">{positive ? "Favorable" : "Unfavorable"}:</span>
              {formatDelta(d.value, isCurrency)}
              {pct !== 0 && (
                <span className="ml-1 text-[10px] opacity-70">
                  ({pct >= 0 ? "+" : ""}
                  {pct.toFixed(0)}%)
                </span>
              )}
            </td>
          );
        })}
      </tr>
    </>
  );
}
