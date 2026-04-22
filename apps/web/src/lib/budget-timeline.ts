/**
 * Aggregates per-line-item monthly forecast series into a single
 * company-wide budget timeline, sorted by month. Used by the expenses page
 * to overlay a "budget" trace on the actuals chart.
 */

export interface BudgetTimelineInput {
  monthlySeries: { month: string; value: number }[];
}

export interface BudgetTimelinePoint {
  month: string;
  value: number;
}

export function aggregateBudgetTimeline(
  lineItems: BudgetTimelineInput[],
): BudgetTimelinePoint[] {
  const totals = new Map<string, number>();
  for (const item of lineItems) {
    for (const point of item.monthlySeries) {
      totals.set(point.month, (totals.get(point.month) ?? 0) + point.value);
    }
  }
  return Array.from(totals.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, value]) => ({ month, value }));
}
