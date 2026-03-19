/**
 * Budget vs. Actuals engine — variance analysis between budgeted (forecast)
 * and actual (transaction) values.
 *
 * A "budget" is a locked scenario's forecast values.
 * "Actuals" are aggregated transactions per account per month.
 */

import { type MonthlySeries, round2, seriesToArray } from "./utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BudgetLineItem {
  accountId: string;
  accountName: string;
  category: string;
  budget: { month: string; value: number }[];
  actual: { month: string; value: number }[];
  variance: { month: string; value: number }[];
  variancePercent: { month: string; value: number }[];
  /** positive = favorable (under budget for expenses, over budget for revenue) */
  favorable: { month: string; value: boolean }[];
}

export interface BudgetVsActuals {
  lineItems: BudgetLineItem[];
  /** Summary totals */
  totalBudget: { month: string; value: number }[];
  totalActual: { month: string; value: number }[];
  totalVariance: { month: string; value: number }[];
}

export interface AccountBudgetInput {
  accountId: string;
  accountName: string;
  category: string;
  /** Whether this is a revenue account (affects favorable/unfavorable logic) */
  isRevenue: boolean;
  budgetValues: MonthlySeries;
  actualValues: MonthlySeries;
}

// ── Core function ────────────────────────────────────────────────────────────

/** Compute budget vs. actuals with variance analysis for all accounts. */
export function computeBudgetVsActuals(
  accounts: AccountBudgetInput[]
): BudgetVsActuals {
  const lineItems: BudgetLineItem[] = [];
  let totalBudgetSeries: MonthlySeries = new Map();
  let totalActualSeries: MonthlySeries = new Map();

  for (const account of accounts) {
    const allMonths = Array.from(
      new Set([...account.budgetValues.keys(), ...account.actualValues.keys()])
    ).sort();

    const budget: { month: string; value: number }[] = [];
    const actual: { month: string; value: number }[] = [];
    const variance: { month: string; value: number }[] = [];
    const variancePercent: { month: string; value: number }[] = [];
    const favorable: { month: string; value: boolean }[] = [];

    for (const month of allMonths) {
      const bVal = account.budgetValues.get(month) ?? 0;
      const aVal = account.actualValues.get(month) ?? 0;
      const diff = round2(aVal - bVal);

      // For revenue: actual > budget is favorable
      // For expenses: actual < budget is favorable
      const isFavorable = account.isRevenue ? diff > 0 : diff < 0;

      budget.push({ month, value: round2(bVal) });
      actual.push({ month, value: round2(aVal) });
      variance.push({ month, value: diff });
      variancePercent.push({
        month,
        value: bVal !== 0 ? round2((diff / Math.abs(bVal)) * 100) : 0,
      });
      favorable.push({ month, value: isFavorable });

      // Accumulate totals (net: revenue positive, expenses negative for net income view)
      const sign = account.isRevenue ? 1 : -1;
      totalBudgetSeries.set(
        month,
        (totalBudgetSeries.get(month) ?? 0) + bVal * sign
      );
      totalActualSeries.set(
        month,
        (totalActualSeries.get(month) ?? 0) + aVal * sign
      );
    }

    lineItems.push({
      accountId: account.accountId,
      accountName: account.accountName,
      category: account.category,
      budget,
      actual,
      variance,
      variancePercent,
      favorable,
    });
  }

  // Total variance
  const totalBudget = seriesToArray(totalBudgetSeries);
  const totalActual = seriesToArray(totalActualSeries);
  const totalVariance = totalBudget.map((b, i) => ({
    month: b.month,
    value: round2((totalActual[i]?.value ?? 0) - b.value),
  }));

  return { lineItems, totalBudget, totalActual, totalVariance };
}
