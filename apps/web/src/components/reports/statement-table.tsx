"use client";

import { useState } from "react";
import { formatMonthYear, formatCompactCurrency } from "@/components/charts";

interface StatementValue {
  month: string;
  value: number;
}

interface StatementLineItem {
  name: string;
  values: StatementValue[];
  children?: StatementLineItem[];
}

interface StatementTableProps {
  sections: Array<{
    item: StatementLineItem;
    isSummary?: boolean;
    isSubtotal?: boolean;
  }>;
  title: string;
}

export function StatementTable({ sections, title }: StatementTableProps) {
  // Get months from first section with data
  const months = sections[0]?.item.values.map((v) => v.month) ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-surface-300">
            <th className="text-left px-3 py-2 text-xs font-semibold text-surface-700 uppercase tracking-wider min-w-[200px]">
              {title}
            </th>
            {months.map((m) => (
              <th key={m} className="text-right px-3 py-2 text-xs font-medium text-surface-500 min-w-[90px]">
                {formatMonthYear(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <StatementSection key={section.item.name} {...section} months={months} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatementSection({
  item,
  isSummary,
  isSubtotal,
  months,
}: {
  item: StatementLineItem;
  isSummary?: boolean;
  isSubtotal?: boolean;
  months: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const valueMap = new Map(item.values.map((v) => [v.month, v.value]));

  const rowClasses = isSummary
    ? "border-t-2 border-surface-400 bg-surface-50 font-bold"
    : isSubtotal
    ? "border-t border-surface-200 font-semibold"
    : "";

  return (
    <>
      <tr className={`hover:bg-surface-50/50 transition-colors ${rowClasses}`}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {hasChildren && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-4 h-4 flex items-center justify-center text-surface-400 hover:text-surface-700"
              >
                <span className="text-xs">{expanded ? "\u25BC" : "\u25B6"}</span>
              </button>
            )}
            <span className={`${isSummary ? "text-surface-900" : isSubtotal ? "text-surface-800" : "text-surface-700"}`}>
              {item.name}
            </span>
          </div>
        </td>
        {months.map((m) => {
          const val = valueMap.get(m) ?? 0;
          return (
            <td key={m} className={`text-right px-3 py-2 tabular-nums ${val < 0 ? "text-red-600" : "text-surface-900"}`}>
              {formatCompactCurrency(val)}
            </td>
          );
        })}
      </tr>
      {expanded &&
        item.children?.map((child) => {
          const childMap = new Map(child.values.map((v) => [v.month, v.value]));
          return (
            <tr key={child.name} className="text-surface-500">
              <td className="px-3 py-1.5 pl-10 text-xs">{child.name}</td>
              {months.map((m) => {
                const val = childMap.get(m) ?? 0;
                return (
                  <td key={m} className={`text-right px-3 py-1.5 text-xs tabular-nums ${val < 0 ? "text-red-400" : ""}`}>
                    {formatCompactCurrency(val)}
                  </td>
                );
              })}
            </tr>
          );
        })}
    </>
  );
}
