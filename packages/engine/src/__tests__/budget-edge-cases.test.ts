import { describe, it, expect } from "vitest";
import { computeBudgetVsActuals, type AccountBudgetInput } from "../budget";

describe("budget vs actuals — edge cases", () => {
  it("handles zero budget (no divide-by-zero in variance %)", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "rev1",
        accountName: "Revenue",
        category: "revenue",
        isRevenue: true,
        budgetValues: new Map([["2026-01", 0]]),
        actualValues: new Map([["2026-01", 5000]]),
      },
    ];
    const result = computeBudgetVsActuals(accounts);
    const line = result.lineItems[0]!;
    expect(line.variance[0]?.value).toBe(5000);
    expect(line.variancePercent[0]?.value).toBe(0); // 0 when budget is 0
  });

  it("handles negative actual values (refunds)", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "rev1",
        accountName: "Revenue",
        category: "revenue",
        isRevenue: true,
        budgetValues: new Map([["2026-01", 10000]]),
        actualValues: new Map([["2026-01", -2000]]),
      },
    ];
    const result = computeBudgetVsActuals(accounts);
    const line = result.lineItems[0]!;
    // -2000 - 10000 = -12000
    expect(line.variance[0]?.value).toBe(-12000);
    expect(line.favorable[0]?.value).toBe(false);
  });

  it("handles budget month with no actual data", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "exp1",
        accountName: "Marketing",
        category: "operating_expense",
        isRevenue: false,
        budgetValues: new Map([["2026-01", 5000], ["2026-02", 6000]]),
        actualValues: new Map([["2026-01", 4000]]), // no Feb actual
      },
    ];
    const result = computeBudgetVsActuals(accounts);
    const line = result.lineItems[0]!;
    // Feb: actual defaults to 0, variance = 0 - 6000 = -6000 (favorable for expense)
    expect(line.variance[1]?.value).toBe(-6000);
    expect(line.favorable[1]?.value).toBe(true);
  });

  it("handles actual month with no budget data", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "exp1",
        accountName: "Unexpected Spend",
        category: "operating_expense",
        isRevenue: false,
        budgetValues: new Map([["2026-01", 1000]]),
        actualValues: new Map([["2026-01", 1000], ["2026-02", 3000]]),
      },
    ];
    const result = computeBudgetVsActuals(accounts);
    const line = result.lineItems[0]!;
    // Feb: budget defaults to 0, variance = 3000 - 0 = 3000 (unfavorable for expense)
    expect(line.variance[1]?.value).toBe(3000);
    expect(line.favorable[1]?.value).toBe(false);
  });

  it("aggregates multiple accounts into totals correctly", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "rev1",
        accountName: "Revenue",
        category: "revenue",
        isRevenue: true,
        budgetValues: new Map([["2026-01", 100000]]),
        actualValues: new Map([["2026-01", 110000]]),
      },
      {
        accountId: "exp1",
        accountName: "Salaries",
        category: "operating_expense",
        isRevenue: false,
        budgetValues: new Map([["2026-01", 40000]]),
        actualValues: new Map([["2026-01", 42000]]),
      },
    ];
    const result = computeBudgetVsActuals(accounts);
    // Total budget: revenue(+100000) + expense(-40000) = 60000
    // Total actual: revenue(+110000) + expense(-42000) = 68000
    expect(result.totalBudget[0]?.value).toBe(60000);
    expect(result.totalActual[0]?.value).toBe(68000);
    expect(result.totalVariance[0]?.value).toBe(8000);
  });

  it("handles empty accounts array", () => {
    const result = computeBudgetVsActuals([]);
    expect(result.lineItems).toHaveLength(0);
    expect(result.totalBudget).toHaveLength(0);
    expect(result.totalActual).toHaveLength(0);
    expect(result.totalVariance).toHaveLength(0);
  });

  it("variance percentage uses absolute budget for correct sign", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "rev1",
        accountName: "Revenue",
        category: "revenue",
        isRevenue: true,
        budgetValues: new Map([["2026-01", 50000]]),
        actualValues: new Map([["2026-01", 40000]]),
      },
    ];
    const result = computeBudgetVsActuals(accounts);
    // Variance = -10000, variance% = -10000 / |50000| * 100 = -20%
    expect(result.lineItems[0]!.variancePercent[0]?.value).toBe(-20);
  });
});
