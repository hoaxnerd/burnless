/**
 * Pure breakdown helpers — reduce computeFinancials' blended per-line series to a
 * reconciled, month-specific breakdown. Single responsibility: grouping + share +
 * residual. No I/O. Used by compute-expenses, compute-revenue, and genui tools so
 * every breakdown surface reconciles to the same blended total the AI text quotes.
 */
import { categorizeTransaction, pctOfTotal } from "@burnless/engine";
import type { MonthlySeries } from "@burnless/engine";
import type { BlendedExpenseLine, BlendedRevenueLine } from "./compute-financials";

export interface ExpenseBreakdownRow {
  subcategory: string;
  amount: number;
  share: number; // 0-100
}
export interface RevenueBreakdownRow {
  streamId: string; // the stream's id, or "imported" for the residual row
  name: string;
  type: string;
  amount: number;
  share: number; // 0-100
}

/** People for headcount; else an explicit per-account override (from the expense
 *  form's Category field); else categorizeTransaction(account name); category
 *  fallback. */
// NOTE: mirrors the categorize+fallback in compute-expenses.ts:deriveSubcategory.
// `subcatByAccount` carries the user's explicit forecast_lines.subcategory, mapped
// to the account the blended line aggregates, so the category chart + AI insight
// honor the same per-entry category the expense table shows.
function deriveSubcategory(line: BlendedExpenseLine, subcatByAccount?: Map<string, string>): string {
  if (line.accountId === "headcount-cost") return "People";
  const override = subcatByAccount?.get(line.accountId);
  if (override && override.trim() !== "") return override.trim();
  const result = categorizeTransaction(line.accountName);
  if (result && result.confidence >= 0.5) return result.subcategory;
  return line.category === "cogs" ? "Cost of Goods Sold" : "Uncategorized";
}

/**
 * @param total - the blended month total the rows reconcile to; pass a non-negative
 *   value (Σ rows === total).
 */
export function buildExpenseBreakdown(
  lines: BlendedExpenseLine[],
  month: string,
  total: number,
  subcatByAccount?: Map<string, string>,
): ExpenseBreakdownRow[] {
  const map = new Map<string, number>();
  for (const line of lines) {
    const amt = line.values.get(month) ?? 0;
    // Skip only EXACT-zero lines. Negative lines (credits / reversals / negative
    // carry-forward) are kept on purpose: they are real reductions to the blended
    // total, and dropping them would break the breakdown↔total reconciliation.
    // The display layer is responsible for rendering negative bars/shares.
    if (amt === 0) continue;
    const key = deriveSubcategory(line, subcatByAccount);
    map.set(key, (map.get(key) ?? 0) + amt);
  }
  return Array.from(map.entries())
    .map(([subcategory, amount]) => ({ subcategory, amount, share: pctOfTotal(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Per-month stacked breakdown for the expense category chart. Reuses the SAME
 * `deriveSubcategory` grouping as `buildExpenseBreakdown` so the stacked chart,
 * the single-month split, and the AI text all read one source. Every row carries
 * every subcategory key (initialised to 0) so the chart has consistent keys.
 *
 * Returns only the per-month rows. The chart's top-6/Other `subcategories`
 * selection is derived by the caller from the current-month breakdown so it
 * matches the single-month split panel (rows still carry past-only keys; the
 * chart only renders the caller's chosen `subcategories` set).
 */
export function buildExpenseMonthlyBySubcategory(
  lines: BlendedExpenseLine[],
  subcatByAccount?: Map<string, string>,
): Record<string, unknown>[] {
  // deriveSubcategory is regex-heavy (categorizeTransaction); compute each line's
  // subcategory key ONCE and reuse it across every month.
  const lineKeys = lines.map((line) => deriveSubcategory(line, subcatByAccount));
  const months = new Set<string>();
  const subcatSet = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    subcatSet.add(lineKeys[i]!);
    for (const month of lines[i]!.values.keys()) months.add(month);
  }
  const subcategories = Array.from(subcatSet);
  const sortedMonths = Array.from(months).sort();
  return sortedMonths.map((month) => {
    const row: Record<string, unknown> = { month };
    for (const subcat of subcategories) row[subcat] = 0;
    for (let i = 0; i < lines.length; i++) {
      const amt = lines[i]!.values.get(month);
      if (amt == null) continue;
      const key = lineKeys[i]!;
      row[key] = (row[key] as number) + amt;
    }
    return row;
  });
}

/**
 * @param total - the blended month total the rows reconcile to; pass a non-negative
 *   value (Σ rows === total).
 */
export function buildRevenueBreakdown(
  lines: BlendedRevenueLine[],
  residual: MonthlySeries,
  month: string,
  total: number,
): RevenueBreakdownRow[] {
  const rows: RevenueBreakdownRow[] = lines
    .map((l) => {
      const amount = l.values.get(month) ?? 0;
      return { streamId: l.streamId, name: l.name, type: l.type, amount, share: pctOfTotal(amount, total) };
    })
    // Skip only EXACT-zero lines. A negative residual / stream value is a real
    // component of the blended total and is kept on purpose so the breakdown
    // reconciles; the display layer renders negative bars/shares.
    .filter((r) => r.amount !== 0);
  const res = residual.get(month) ?? 0;
  if (res !== 0) {
    rows.push({ streamId: "imported", name: "Imported / Other revenue", type: "imported", amount: res, share: pctOfTotal(res, total) });
  }
  return rows.sort((a, b) => b.amount - a.amount);
}
