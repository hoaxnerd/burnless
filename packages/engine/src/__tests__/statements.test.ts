import { describe, it, expect } from "vitest";
import { generateProfitAndLoss, generateCashFlow, type AccountData } from "../statements";
import type { MonthlySeries } from "../utils";

function makeSeries(values: Record<string, number>): MonthlySeries {
  return new Map(Object.entries(values));
}

describe("statements", () => {
  const accounts: AccountData[] = [
    { id: "rev", name: "SaaS Revenue", category: "revenue", values: makeSeries({ "2026-01": 50000, "2026-02": 55000 }) },
    { id: "cogs", name: "Hosting", category: "cogs", values: makeSeries({ "2026-01": 5000, "2026-02": 5500 }) },
    { id: "opex1", name: "Salaries", category: "operating_expense", values: makeSeries({ "2026-01": 30000, "2026-02": 30000 }) },
    { id: "opex2", name: "Office", category: "operating_expense", values: makeSeries({ "2026-01": 2000, "2026-02": 2000 }) },
  ];

  describe("P&L", () => {
    it("calculates gross profit, operating income, and net income", () => {
      const pnl = generateProfitAndLoss(accounts);

      // Revenue
      expect(pnl.revenue.values[0]?.value).toBe(50000);

      // Gross Profit = Revenue - COGS = 50000 - 5000 = 45000
      expect(pnl.grossProfit.values[0]?.value).toBe(45000);

      // Operating Income = GP - OpEx = 45000 - 32000 = 13000
      expect(pnl.operatingIncome.values[0]?.value).toBe(13000);

      // Net Income (no other income/expense) = Operating Income = 13000
      expect(pnl.netIncome.values[0]?.value).toBe(13000);

      // Gross Margin = 45000/50000 * 100 = 90%
      expect(pnl.grossMargin[0]?.value).toBe(90);
    });

    it("includes children breakdown", () => {
      const pnl = generateProfitAndLoss(accounts);
      expect(pnl.operatingExpenses.children).toHaveLength(2);
      expect(pnl.operatingExpenses.children![0]?.name).toBe("Salaries");
    });
  });

  describe("Cash Flow", () => {
    it("calculates ending cash from starting cash + net changes", () => {
      const cf = generateCashFlow(accounts, 100000);
      // Operating CF = Revenue - COGS - OpEx = 50000 - 5000 - 32000 = 13000
      expect(cf.operatingCashFlow.values[0]?.value).toBe(13000);
      // Ending cash = 100000 + 13000 = 113000
      expect(cf.endingCash[0]?.value).toBe(113000);
    });

    it("includes funding inflows in financing CF", () => {
      const funding = new Map([["2026-01", 500000]]);
      const cf = generateCashFlow(accounts, 0, funding);
      expect(cf.financingCashFlow.values[0]?.value).toBe(500000);
      // Net = 13000 + 500000 = 513000
      expect(cf.endingCash[0]?.value).toBe(513000);
    });
  });
});
