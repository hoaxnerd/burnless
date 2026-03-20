"use client";

import { useState, useMemo, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => ReactNode;
  className?: string;
  /** Provide a sort value extractor to make this column sortable */
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  compact?: boolean;
  /** Optional click handler per row */
  onRowClick?: (row: T) => void;
}

type SortDir = "asc" | "desc";

export function DataTable<T>({
  columns,
  data,
  rowKey,
  emptyMessage = "No data",
  compact,
  onRowClick,
}: DataTableProps<T>) {
  const cellPadding = compact ? "px-3 py-1.5" : "px-4 py-3";
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return data;
    const extractor = col.sortValue;
    return [...data].sort((a, b) => {
      const va = extractor(a);
      const vb = extractor(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200">
            {columns.map((col) => {
              const isSortable = !!col.sortValue;
              const isActive = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  className={`${cellPadding} text-xs font-medium text-surface-500 uppercase tracking-wider ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left"
                  } ${isSortable ? "cursor-pointer select-none hover:text-surface-700 transition-colors" : ""} ${col.className ?? ""}`}
                  onClick={isSortable ? () => handleSort(col) : undefined}
                  aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {isSortable &&
                      (isActive ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className={`${cellPadding} text-center text-surface-400 py-12`}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={rowKey(row)}
                className={`hover:bg-surface-50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${cellPadding} ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : "text-left"
                    } ${col.className ?? ""}`}
                  >
                    {col.render
                      ? col.render(row)
                      : String(
                          (row as Record<string, unknown>)[col.key] ?? "",
                        )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
