import { bold, dim } from "./ansi";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Minimal aligned-column table (spec §7.4: human output = aligned tables).
 * Last column is not right-padded so lines never carry trailing whitespace.
 */
export function renderTable(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return dim("(no rows)");
  const cols = columns ?? [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = cols.map((col) => Math.max(col.length, ...rows.map((row) => cell(row[col]).length)));
  const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length));
  const line = (cells: string[]): string =>
    cells.map((c, i) => (i === cols.length - 1 ? c : pad(c, widths[i] ?? 0))).join("  ");
  const header = bold(line(cols.map((c) => c.toUpperCase())));
  const separator = dim(line(cols.map((_, i) => "-".repeat(widths[i] ?? 0))));
  const body = rows.map((row) => line(cols.map((col) => cell(row[col]))));
  return [header, separator, ...body].join("\n");
}

/**
 * Human rendering of a tool/resource text payload. JSON array-of-objects → table,
 * JSON object → key/value rows, everything else → raw text. `--json` mode never
 * calls this — raw text goes straight to stdout.
 */
export function formatResult(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((row) => row !== null && typeof row === "object" && !Array.isArray(row))
  ) {
    return renderTable(parsed as Array<Record<string, unknown>>);
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return renderTable(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({ key, value }))
    );
  }
  return text;
}
