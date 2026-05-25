import { describe, it, expect } from "vitest";
import {
  generateProfitAndLoss,
  generateCashFlow,
  generateBalanceSheet,
  type AccountData,
} from "../statements";
import type { FundingImpact } from "../funding";

describe("statements — edge cases", () => {
  describe("P&L", () => {
    it("handles empty accounts array", () => {
      const pnl = generateProfitAndLoss([]);
      expect(pnl.revenue.values).toHaveLength(0);
      expect(pnl.netIncome.values).toHaveLength(0);
    });

    it("handles revenue-only scenario (no expenses)", () => {
      const accounts: AccountData[] = [
        {
          id: "r1",
          name: "SaaS Revenue",
          category: "revenue",
          values: new Map([["2026-01", 50000]]),
        },
      ];
      const pnl = generateProfitAndLoss(accounts);
      expect(pnl.revenue.values[0]?.value).toBe(50000);
      expect(pnl.grossProfit.values[0]?.value).toBe(50000);
      expect(pnl.netIncome.values[0]?.value).toBe(50000);
      expect(pnl.grossMargin[0]?.value).toBe(100);
      expect(pnl.netMargin[0]?.value).toBe(100);
    });

    it("handles expense-only scenario (no revenue) — negative net income", () => {
      const accounts: AccountData[] = [
        {
          id: "e1",
          name: "Salaries",
          category: "operating_expense",
          values: new Map([["2026-01", 30000]]),
        },
      ];
      const pnl = generateProfitAndLoss(accounts);
      expect(pnl.revenue.values).toHaveLength(0);
      expect(pnl.operatingExpenses.values[0]?.value).toBe(30000);
      // Net income = 0 - 0 - 30000 = -30000
      expect(pnl.netIncome.values[0]?.value).toBe(-30000);
    });

    it("handles zero revenue (margin is 0%)", () => {
      const accounts: AccountData[] = [
        {
          id: "r1",
          name: "Revenue",
          category: "revenue",
          values: new Map([["2026-01", 0]]),
        },
      ];
      const pnl = generateProfitAndLoss(accounts);
      expect(pnl.grossMargin[0]?.value).toBe(0);
      expect(pnl.netMargin[0]?.value).toBe(0);
    });

    it("includes other income and other expenses", () => {
      const accounts: AccountData[] = [
        {
          id: "r1",
          name: "Revenue",
          category: "revenue",
          values: new Map([["2026-01", 100000]]),
        },
        {
          id: "oi1",
          name: "Interest Income",
          category: "other_income",
          values: new Map([["2026-01", 500]]),
        },
        {
          id: "oe1",
          name: "Interest Expense",
          category: "other_expense",
          values: new Map([["2026-01", 200]]),
        },
      ];
      const pnl = generateProfitAndLoss(accounts);
      expect(pnl.otherIncome.values[0]?.value).toBe(500);
      expect(pnl.otherExpenses.values[0]?.value).toBe(200);
      // Net income = 100000 (operating) + 500 - 200 = 100300
      expect(pnl.netIncome.values[0]?.value).toBe(100300);
    });

    it("includes child account breakdowns", () => {
      const accounts: AccountData[] = [
        {
          id: "r1",
          name: "Product Revenue",
          category: "revenue",
          values: new Map([["2026-01", 30000]]),
        },
        {
          id: "r2",
          name: "Services Revenue",
          category: "revenue",
          values: new Map([["2026-01", 20000]]),
        },
      ];
      const pnl = generateProfitAndLoss(accounts);
      expect(pnl.revenue.children).toHaveLength(2);
      expect(pnl.revenue.children![0]!.name).toBe("Product Revenue");
      expect(pnl.revenue.children![1]!.name).toBe("Services Revenue");
      expect(pnl.revenue.values[0]?.value).toBe(50000);
    });
  });

  describe("Cash Flow", () => {
    it("handles empty accounts with zero starting cash", () => {
      const cf = generateCashFlow([]);
      expect(cf.endingCash).toHaveLength(0);
    });

    it("accumulates ending cash correctly", () => {
      const accounts: AccountData[] = [
        {
          id: "r1",
          name: "Revenue",
          category: "revenue",
          values: new Map([["2026-01", 50000], ["2026-02", 60000]]),
        },
        {
          id: "e1",
          name: "OpEx",
          category: "operating_expense",
          values: new Map([["2026-01", 30000], ["2026-02", 35000]]),
        },
      ];
      const cf = generateCashFlow(accounts, 100000);
      // Jan operating CF: 50000 - 30000 = 20000. Ending cash: 100000 + 20000 = 120000
      expect(cf.endingCash[0]?.value).toBe(120000);
      // Feb: 60000 - 35000 = 25000. Ending: 120000 + 25000 = 145000
      expect(cf.endingCash[1]?.value).toBe(145000);
    });

    it("includes funding inflows in financing CF", () => {
      const accounts: AccountData[] = [
        {
          id: "r1",
          name: "Revenue",
          category: "revenue",
          values: new Map([["2026-01", 10000]]),
        },
      ];
      const impact: FundingImpact = {
        equityInflows: new Map([["2026-01", 500000]]),
        debtInflows: new Map(),
        interestExpense: new Map(),
        principalPayments: new Map(),
        grantDisbursements: new Map(),
        warnings: [],
      };
      const cf = generateCashFlow(accounts, 0, undefined, impact);
      // Operating CF = 10000, Financing = 500000
      expect(cf.financingCashFlow.values[0]?.value).toBe(500000);
      // Ending cash = 0 + 10000 + 500000 = 510000
      expect(cf.endingCash[0]?.value).toBe(510000);
    });

    it("handles asset purchases as investing cash outflow", () => {
      const accounts: AccountData[] = [
        {
          id: "a1",
          name: "Equipment",
          category: "asset",
          values: new Map([["2026-01", 25000]]),
        },
      ];
      const cf = generateCashFlow(accounts, 100000);
      // Asset increase = cash outflow (negative investing CF)
      expect(cf.investingCashFlow.values[0]?.value).toBe(-25000);
      expect(cf.endingCash[0]?.value).toBe(75000);
    });

    it("handles negative cash position (overdraft)", () => {
      const accounts: AccountData[] = [
        {
          id: "e1",
          name: "Expenses",
          category: "operating_expense",
          values: new Map([["2026-01", 200000]]),
        },
      ];
      const cf = generateCashFlow(accounts, 50000);
      // Operating: -200000. Ending: 50000 - 200000 = -150000
      expect(cf.endingCash[0]?.value).toBe(-150000);
    });
  });

  describe("Balance Sheet", () => {
    it("handles empty accounts", () => {
      const bs = generateBalanceSheet([]);
      expect(bs.assets.values).toHaveLength(0);
      expect(bs.liabilities.values).toHaveLength(0);
      expect(bs.equity.values).toHaveLength(0);
    });

    it("sums multiple asset accounts", () => {
      const accounts: AccountData[] = [
        {
          id: "a1",
          name: "Cash",
          category: "asset",
          values: new Map([["2026-01", 500000]]),
        },
        {
          id: "a2",
          name: "Equipment",
          category: "asset",
          values: new Map([["2026-01", 50000]]),
        },
      ];
      const bs = generateBalanceSheet(accounts);
      expect(bs.assets.values[0]?.value).toBe(550000);
      expect(bs.assets.children).toHaveLength(2);
    });

    it("includes liabilities and equity", () => {
      const accounts: AccountData[] = [
        {
          id: "a1",
          name: "Cash",
          category: "asset",
          values: new Map([["2026-01", 1000000]]),
        },
        {
          id: "l1",
          name: "Loan",
          category: "liability",
          values: new Map([["2026-01", 200000]]),
        },
        {
          id: "e1",
          name: "Founders Equity",
          category: "equity",
          values: new Map([["2026-01", 800000]]),
        },
      ];
      const bs = generateBalanceSheet(accounts);
      expect(bs.assets.values[0]?.value).toBe(1000000);
      expect(bs.liabilities.values[0]?.value).toBe(200000);
      expect(bs.equity.values[0]?.value).toBe(800000);
    });
  });
});
