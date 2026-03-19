import { describe, it, expect } from "vitest";
import { computeBudgetVsActuals, type AccountBudgetInput } from "../budget";

describe("budget vs actuals", () => {
  it("calculates variance for revenue accounts", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "rev1",
        accountName: "SaaS Revenue",
        category: "revenue",
        isRevenue: true,
        budgetValues: new Map([["2026-01", 50000], ["2026-02", 55000]]),
        actualValues: new Map([["2026-01", 52000], ["2026-02", 48000]]),
      },
    ];

    const result = computeBudgetVsActuals(accounts);
    const rev = result.lineItems[0]!;

    // Jan: 52000 - 50000 = +2000 (favorable for revenue)
    expect(rev.variance[0]?.value).toBe(2000);
    expect(rev.favorable[0]?.value).toBe(true);

    // Feb: 48000 - 55000 = -7000 (unfavorable for revenue)
    expect(rev.variance[1]?.value).toBe(-7000);
    expect(rev.favorable[1]?.value).toBe(false);
  });

  it("calculates variance for expense accounts", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "exp1",
        accountName: "Marketing",
        category: "operating_expense",
        isRevenue: false,
        budgetValues: new Map([["2026-01", 10000]]),
        actualValues: new Map([["2026-01", 8000]]),
      },
    ];

    const result = computeBudgetVsActuals(accounts);
    const exp = result.lineItems[0]!;

    // 8000 - 10000 = -2000 (favorable for expenses - under budget)
    expect(exp.variance[0]?.value).toBe(-2000);
    expect(exp.favorable[0]?.value).toBe(true);
  });

  it("calculates variance percentages", () => {
    const accounts: AccountBudgetInput[] = [
      {
        accountId: "rev1",
        accountName: "Revenue",
        category: "revenue",
        isRevenue: true,
        budgetValues: new Map([["2026-01", 100000]]),
        actualValues: new Map([["2026-01", 110000]]),
      },
    ];

    const result = computeBudgetVsActuals(accounts);
    expect(result.lineItems[0]!.variancePercent[0]?.value).toBe(10); // +10%
  });
});
