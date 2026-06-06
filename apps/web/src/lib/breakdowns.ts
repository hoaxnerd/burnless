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
  name: string;
  type: string;
  amount: number;
  share: number; // 0-100
}

/** People for headcount; else categorizeTransaction(account name); category fallback. */
// NOTE: mirrors the categorize+fallback in compute-expenses.ts:deriveSubcategory.
// Task 3 rewires compute-expenses to consume these blended breakdowns; fold the
// shared subcategory logic into one place then.
function deriveSubcategory(line: BlendedExpenseLine): string {
  if (line.accountId === "headcount-cost") return "People";
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
): ExpenseBreakdownRow[] {
  const map = new Map<string, number>();
  for (const line of lines) {
    const amt = line.values.get(month) ?? 0;
    // Skip only EXACT-zero lines. Negative lines (credits / reversals / negative
    // carry-forward) are kept on purpose: they are real reductions to the blended
    // total, and dropping them would break the breakdown↔total reconciliation.
    // The display layer is responsible for rendering negative bars/shares.
    if (amt === 0) continue;
    const key = deriveSubcategory(line);
    map.set(key, (map.get(key) ?? 0) + amt);
  }
  return Array.from(map.entries())
    .map(([subcategory, amount]) => ({ subcategory, amount, share: pctOfTotal(amount, total) }))
    .sort((a, b) => b.amount - a.amount);
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
      return { name: l.name, type: l.type, amount, share: pctOfTotal(amount, total) };
    })
    // Skip only EXACT-zero lines. A negative residual / stream value is a real
    // component of the blended total and is kept on purpose so the breakdown
    // reconciles; the display layer renders negative bars/shares.
    .filter((r) => r.amount !== 0);
  const res = residual.get(month) ?? 0;
  if (res !== 0) {
    rows.push({ name: "Imported / Other revenue", type: "imported", amount: res, share: pctOfTotal(res, total) });
  }
  return rows.sort((a, b) => b.amount - a.amount);
}
