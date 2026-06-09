/**
 * Excel/spreadsheet export utilities — generates .csv formatted data
 * for financial reports with proper formatting.
 *
 * Works client-side. Generates multi-sheet CSV downloads for P&L,
 * Cash Flow, and Balance Sheet reports.
 */

import { formatDate } from "@burnless/types";

interface StatementLineItem {
  name: string;
  values: { month: string; value: number }[];
  children?: StatementLineItem[];
}

interface ExcelExportOptions {
  title: string;
  companyName: string;
  scenarioName: string;
  months: string[];
  locale?: string;
}

// ── Formatting ──────────────────────────────────────────────────────────────

function fmtMonthHeader(monthKey: string): string {
  const parts = monthKey.split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "0";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function escapeCSV(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ── CSV Generation ──────────────────────────────────────────────────────────

function buildCSVRows(
  items: StatementLineItem[],
  months: string[],
  indent: number = 0
): string[][] {
  const rows: string[][] = [];
  for (const item of items) {
    const prefix = "  ".repeat(indent);
    const row = [prefix + item.name];
    for (const m of months) {
      const v = item.values.find((v) => v.month === m);
      row.push(v ? String(v.value) : "0");
    }
    rows.push(row);
    if (item.children) {
      rows.push(...buildCSVRows(item.children, months, indent + 1));
    }
  }
  return rows;
}

function toCSVString(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCSV).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(","));
  }
  return lines.join("\n");
}

// ── Public API ──────────────────────────────────────────────────────────────

export function generateStatementCSV(
  options: ExcelExportOptions,
  sections: { name: string; items: StatementLineItem[] }[]
): string {
  const headers = ["Account", ...options.months.map(fmtMonthHeader)];
  const allRows: string[][] = [];

  // Header metadata
  allRows.push([options.title]);
  allRows.push([`Company: ${options.companyName}`]);
  allRows.push([`Scenario: ${options.scenarioName}`]);
  allRows.push([`Generated: ${formatDate(new Date(), options.locale)}`]);
  allRows.push([]);

  for (const section of sections) {
    allRows.push([section.name]);
    allRows.push(...buildCSVRows(section.items, options.months));
    allRows.push([]);
  }

  return toCSVString(headers, allRows);
}

export function generateTransactionsCSV(
  transactions: {
    date: string;
    amount: number;
    description: string | null;
    accountName: string;
    source: string;
  }[],
  locale?: string
): string {
  const headers = ["Date", "Amount", "Description", "Account", "Source"];
  const rows = transactions.map((t) => [
    formatDate(new Date(t.date), locale),
    String(t.amount),
    t.description || "",
    t.accountName,
    t.source,
  ]);
  return toCSVString(headers, rows);
}

export function generateMetricsCSV(
  metrics: { name: string; values: { month: string; value: number }[] }[],
  months: string[]
): string {
  const headers = ["Metric", ...months.map(fmtMonthHeader)];
  const rows = metrics.map((m) => {
    const row = [m.name];
    for (const month of months) {
      const v = m.values.find((v) => v.month === month);
      row.push(v ? String(v.value) : "0");
    }
    return row;
  });
  return toCSVString(headers, rows);
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
