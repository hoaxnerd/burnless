import { describe, it, expect, vi } from "vitest";

vi.mock("../compute-dashboard", () => ({
  computeDashboardData: vi.fn(async () => ({
    currentMonth: "2026-06", prevMonth: "2026-05",
    totalExpenses: new Map([["2026-06", 10500], ["2026-05", 9000]]),
    expenseLines: [
      { accountId: "1", accountName: "Hosting", category: "cogs", values: new Map([["2026-06", 500], ["2026-05", 400]]) },
      { accountId: "headcount-cost", accountName: "Personnel Costs", category: "operating_expense", values: new Map([["2026-06", 9000], ["2026-05", 8000]]) },
      { accountId: "2", accountName: "Software Subscriptions", category: "operating_expense", values: new Map([["2026-06", 1000], ["2026-05", 600]]) },
    ],
  })),
}));
vi.mock("../data", () => ({
  getAccounts: vi.fn(async () => []),
  getForecastLines: vi.fn(async () => []),
  getHeadcountPlans: vi.fn(async () => []),
}));
import { computeExpenseDetails } from "../compute-expenses";

describe("computeExpenseDetails — blended breakdown", () => {
  it("subcategoryBreakdown reconciles to the dashboard totalExpenses", async () => {
    const d = await computeExpenseDetails("co", "sc");
    expect(d.subcategoryBreakdown.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(10500, 2);
    expect(d.subcategoryBreakdown[0]?.subcategory).toBe("People");
    expect(d.totalMonthlyCost).toBeCloseTo(10500, 2);
  });

  it("derives prevAmount from the blended prev-month breakdown (actuals-only subcat)", async () => {
    // The Hosting/cogs line has no forecast lineItems match (getForecastLines → []),
    // so the old forecast-summed prevAmount would be 0. The blended prev breakdown
    // gives it the real 2026-05 value of 400.
    const d = await computeExpenseDetails("co", "sc");
    const cogs = d.subcategoryBreakdown.find((b) => b.subcategory === "Cost of Goods Sold");
    expect(cogs?.amount).toBe(500);
    expect(cogs?.prevAmount).toBe(400);
    expect(cogs?.changePercent).not.toBe(0);
  });
});
