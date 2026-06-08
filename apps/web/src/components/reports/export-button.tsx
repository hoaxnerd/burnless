"use client";

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
  headers: string[];
}

export function ExportCSVButton({ data, filename, headers }: ExportButtonProps) {
  const handleExport = () => {
    const csvRows = [headers.join(",")];
    for (const row of data) {
      const values = headers.map((h) => {
        const val = row[h];
        if (typeof val === "string" && val.includes(",")) return `"${val}"`;
        return String(val ?? "");
      });
      csvRows.push(values.join(","));
    }
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      Export CSV
    </button>
  );
}

/** Convert a statement to flat CSV-ready rows */
export function statementToCSVRows(
  sections: Array<{ name: string; values: { month: string; value: number }[] }>
): { headers: string[]; data: Record<string, unknown>[] } {
  if (sections.length === 0) return { headers: ["Item"], data: [] };

  // RPT-11: build the header-month UNION across ALL sections, not just the
  // first. Transaction-only sections (e.g. COGS) have shorter values arrays;
  // taking months from sections[0] left their later months as blank cells.
  // Preserve first-seen month order across sections.
  const months: string[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    for (const val of section.values) {
      if (!seen.has(val.month)) {
        seen.add(val.month);
        months.push(val.month);
      }
    }
  }
  const headers = ["Item", ...months];
  const data = sections.map((section) => {
    const row: Record<string, unknown> = { Item: section.name };
    for (const val of section.values) {
      row[val.month] = val.value;
    }
    // RPT-11: default any missing month cell to 0 (matches the UI table's zero
    // fallback). CSV writes raw numbers — engine never formats — so 0 is correct.
    for (const month of months) {
      if (!(month in row)) row[month] = 0;
    }
    return row;
  });

  return { headers, data };
}
