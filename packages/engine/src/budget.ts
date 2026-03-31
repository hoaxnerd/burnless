/**
 * Budget vs. Actuals engine — variance analysis between budgeted (forecast)
 * and actual (transaction) values.
 *
 * A "budget" is a locked scenario's forecast values.
 * "Actuals" are aggregated transactions per account per month.
 */

import { type MonthlySeries, round2, seriesToArray } from "./utils";
import { D, dRound2, dAbs } from "./decimal";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BudgetLineItem {
  accountId: string;
  accountName: string;
  category: string;
  budget: { month: string; value: number }[];
  actual: { month: string; value: number }[];
  variance: { month: string; value: number }[];
  variancePercent: { month: string; value: number | null }[];
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
    const variancePercent: { month: string; value: number | null }[] = [];
    const favorable: { month: string; value: boolean }[] = [];

    for (const month of allMonths) {
      const bVal = D(account.budgetValues.get(month) ?? 0);
      const aVal = D(account.actualValues.get(month) ?? 0);
      const diff = aVal.minus(bVal);
      const diffRounded = dRound2(diff);

      // For revenue: actual > budget is favorable
      // For expenses: actual < budget is favorable
      const isFavorable = account.isRevenue ? diff.gt(0) : diff.lt(0);

      budget.push({ month, value: dRound2(bVal) });
      actual.push({ month, value: dRound2(aVal) });
      variance.push({ month, value: diffRounded });
      variancePercent.push({
        month,
        value: !bVal.isZero() ? dRound2(diff.div(dAbs(bVal)).mul(100)) : (aVal.isZero() ? 0 : null),
      });
      favorable.push({ month, value: isFavorable });

      // Accumulate totals (net: revenue positive, expenses negative for net income view)
      const sign = account.isRevenue ? 1 : -1;
      totalBudgetSeries.set(
        month,
        D(totalBudgetSeries.get(month) ?? 0).plus(bVal.mul(sign)).toNumber()
      );
      totalActualSeries.set(
        month,
        D(totalActualSeries.get(month) ?? 0).plus(aVal.mul(sign)).toNumber()
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
    value: dRound2(D(totalActual[i]?.value ?? 0).minus(b.value)),
  }));

  return { lineItems, totalBudget, totalActual, totalVariance };
}
