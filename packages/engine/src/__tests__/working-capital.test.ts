import { describe, it, expect } from "vitest";
import {
  computeAccountsReceivable,
  computeAccountsPayable,
  computeDepreciation,
  computeWorkingCapitalAdjustments,
  generateCashFlow,
  generateBalanceSheet,
  type AccountData,
  type WorkingCapitalConfig,
  type CapitalAsset,
} from "../statements";
import type { MonthlySeries } from "../utils";

describe("working capital modeling", () => {
  // Helper to create monthly series
  function series(data: Record<string, number>): MonthlySeries {
    return new Map(Object.entries(data));
  }

  const monthKeys = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

  // ── Accounts Receivable ───────────────────────────────────────────────────

  describe("computeAccountsReceivable", () => {
    it("Net-30: A/R balance ≈ 1 month of revenue", () => {
      const revenue = series({
        "2026-01": 100000,
        "2026-02": 100000,
        "2026-03": 100000,
      });

      const { balance } = computeAccountsReceivable(revenue, { days: 30 });

      // With Net-30, ~1 month of revenue sits in A/R
      // First month: AR ≈ current month revenue (1 month lag)
      expect(balance.get("2026-01")).toBe(100000);
      expect(balance.get("2026-02")).toBe(100000);
      expect(balance.get("2026-03")).toBe(100000);
    });

    it("Net-60: A/R balance ≈ 2 months of revenue", () => {
      const revenue = series({
        "2026-01": 50000,
        "2026-02": 50000,
        "2026-03": 50000,
      });

      const { balance } = computeAccountsReceivable(revenue, { days: 60 });

      // After enough history, A/R ≈ 2 months of revenue
      expect(balance.get("2026-03")).toBe(100000); // 50k + 50k
    });

    it("tracks A/R changes month-over-month", () => {
      const revenue = series({
        "2026-01": 100000,
        "2026-02": 120000, // revenue increased
        "2026-03": 120000,
      });

      const { change } = computeAccountsReceivable(revenue, { days: 30 });

      // First month: change = new A/R balance - starting balance (0)
      expect(change.get("2026-01")).toBe(100000);
      // Second month: A/R increased because revenue increased
      expect(change.get("2026-02")).toBe(20000);
      // Third month: stable revenue, no change
      expect(change.get("2026-03")).toBe(0);
    });

    it("respects starting A/R balance", () => {
      const revenue = series({
        "2026-01": 100000,
      });

      const { change } = computeAccountsReceivable(revenue, { days: 30 }, 80000);

      // Change = new balance (100000) - starting (80000) = 20000
      expect(change.get("2026-01")).toBe(20000);
    });

    it("zero days means no A/R lag", () => {
      const revenue = series({
        "2026-01": 100000,
        "2026-02": 100000,
      });

      // With 0 days, everything is collected immediately
      const { balance, change } = computeAccountsReceivable(revenue, { days: 0 });
      // Balance should be 0 (nothing outstanding)
      expect(balance.get("2026-01")).toBe(0);
      expect(change.get("2026-01")).toBe(0);
    });
  });

  // ── Accounts Payable ──────────────────────────────────────────────────────

  describe("computeAccountsPayable", () => {
    it("Net-30: A/P balance ≈ 1 month of expenses", () => {
      const expenses = series({
        "2026-01": 60000,
        "2026-02": 60000,
        "2026-03": 60000,
      });

      const { balance } = computeAccountsPayable(expenses, { days: 30 });

      expect(balance.get("2026-01")).toBe(60000);
      expect(balance.get("2026-02")).toBe(60000);
    });

    it("A/P increase = cash preserved (positive for cash flow)", () => {
      const expenses = series({
        "2026-01": 50000,
        "2026-02": 70000, // expenses increased
      });

      const { change } = computeAccountsPayable(expenses, { days: 30 });

      // A/P increased: we owe more but haven't paid yet = cash preserved
      expect(change.get("2026-02")).toBe(20000);
    });
  });

  // ── Depreciation ──────────────────────────────────────────────────────────

  describe("computeDepreciation", () => {
    it("straight-line depreciation over useful life", () => {
      const asset: CapitalAsset = {
        name: "Server Equipment",
        cost: 120000,
        usefulLifeMonths: 12,
        salvageValue: 0,
        purchaseMonth: "2026-01",
      };

      const { monthly } = computeDepreciation([asset], monthKeys);

      // 120000 / 12 = 10000 per month
      expect(monthly.get("2026-01")).toBe(10000);
      expect(monthly.get("2026-06")).toBe(10000);
    });

    it("accounts for salvage value", () => {
      const asset: CapitalAsset = {
        name: "Office Furniture",
        cost: 60000,
        usefulLifeMonths: 60,
        salvageValue: 6000,
        purchaseMonth: "2026-01",
      };

      const { monthly } = computeDepreciation([asset], monthKeys);

      // (60000 - 6000) / 60 = 900 per month
      expect(monthly.get("2026-01")).toBe(900);
    });

    it("records CapEx in purchase month", () => {
      const asset: CapitalAsset = {
        name: "Equipment",
        cost: 50000,
        usefulLifeMonths: 24,
        purchaseMonth: "2026-03",
      };

      const { capex } = computeDepreciation([asset], monthKeys);

      expect(capex.get("2026-01")).toBe(0);
      expect(capex.get("2026-02")).toBe(0);
      expect(capex.get("2026-03")).toBe(50000);
      expect(capex.get("2026-04")).toBe(0);
    });

    it("starts depreciation from purchase month", () => {
      const asset: CapitalAsset = {
        name: "Equipment",
        cost: 24000,
        usefulLifeMonths: 24,
        purchaseMonth: "2026-03",
      };

      const { monthly } = computeDepreciation([asset], monthKeys);

      expect(monthly.get("2026-01")).toBe(0);
      expect(monthly.get("2026-02")).toBe(0);
      expect(monthly.get("2026-03")).toBe(1000); // 24000/24
      expect(monthly.get("2026-04")).toBe(1000);
    });

    it("sums depreciation from multiple assets", () => {
      const assets: CapitalAsset[] = [
        { name: "A", cost: 12000, usefulLifeMonths: 12, purchaseMonth: "2026-01" },
        { name: "B", cost: 24000, usefulLifeMonths: 12, purchaseMonth: "2026-01" },
      ];

      const { monthly } = computeDepreciation(assets, monthKeys);

      // 12000/12 + 24000/12 = 1000 + 2000 = 3000
      expect(monthly.get("2026-01")).toBe(3000);
    });
  });

  // ── Cash Flow with Working Capital ────────────────────────────────────────

  describe("generateCashFlow with working capital", () => {
    const baseAccounts: AccountData[] = [
      { id: "rev", name: "Revenue", category: "revenue", values: series({
        "2026-01": 200000, "2026-02": 200000, "2026-03": 200000,
      })},
      { id: "cogs", name: "COGS", category: "cogs", values: series({
        "2026-01": 60000, "2026-02": 60000, "2026-03": 60000,
      })},
      { id: "opex", name: "OpEx", category: "operating_expense", values: series({
        "2026-01": 80000, "2026-02": 80000, "2026-03": 80000,
      })},
    ];

    it("without working capital config, uses simplified model", () => {
      const cf = generateCashFlow(baseAccounts, 500000);

      // Net income = 200k - 60k - 80k = 60k per month
      const jan = cf.operatingCashFlow.values.find((v) => v.month === "2026-01");
      expect(jan?.value).toBe(60000);
    });

    it("with working capital, adjusts operating CF for A/R and A/P", () => {
      const config: WorkingCapitalConfig = {
        receivableTerms: { days: 30 },
        payableTerms: { days: 30 },
      };

      const cf = generateCashFlow(baseAccounts, 500000, config);

      // Operating CF should differ from simplified model
      // because A/R and A/P adjustments are applied
      const jan = cf.operatingCashFlow.values.find((v) => v.month === "2026-01");
      // Net income = 60000
      // + depreciation (0) - A/R change (200000) + A/P change (140000)
      // = 60000 - 200000 + 140000 = 0
      expect(jan?.value).toBe(0);
    });

    it("with depreciation, adds back non-cash expense", () => {
      const config: WorkingCapitalConfig = {
        capitalAssets: [
          { name: "Servers", cost: 120000, usefulLifeMonths: 12, purchaseMonth: "2026-01" },
        ],
      };

      const cf = generateCashFlow(baseAccounts, 500000, config);

      // Operating CF = 60000 + 10000 (depreciation) = 70000
      const jan = cf.operatingCashFlow.values.find((v) => v.month === "2026-01");
      expect(jan?.value).toBe(70000);

      // CapEx should show as investing cash outflow
      const invJan = cf.investingCashFlow.values.find((v) => v.month === "2026-01");
      expect(invJan?.value).toBe(-120000);
    });

    it("ending cash tracks cumulative position", () => {
      const cf = generateCashFlow(baseAccounts, 100000);

      const endingJan = cf.endingCash.find((v) => v.month === "2026-01");
      expect(endingJan?.value).toBe(160000); // 100000 + 60000
    });
  });

  // ── Balance Sheet with Working Capital ──────────────────────────────────

  describe("generateBalanceSheet with working capital", () => {
    const accounts: AccountData[] = [
      { id: "cash", name: "Cash", category: "asset", values: series({ "2026-01": 500000 }) },
      { id: "loan", name: "Bank Loan", category: "liability", values: series({ "2026-01": 200000 }) },
      { id: "equity", name: "Equity", category: "equity", values: series({ "2026-01": 300000 }) },
    ];

    it("computes working capital and current ratio", () => {
      const bs = generateBalanceSheet(accounts);

      const wc = bs.workingCapital.find((v) => v.month === "2026-01");
      // Working capital = current assets (500000) - current liabilities (200000) = 300000
      expect(wc?.value).toBe(300000);

      const cr = bs.currentRatio.find((v) => v.month === "2026-01");
      // Current ratio = 500000 / 200000 = 2.5
      expect(cr?.value).toBe(2.5);
    });

    it("includes A/R in current assets when provided", () => {
      const arBalance: MonthlySeries = new Map([["2026-01", 150000]]);
      const adjustments = {
        arChange: new Map(),
        apChange: new Map(),
        depreciation: new Map(),
        accountsReceivable: arBalance,
        accountsPayable: new Map(),
        capitalExpenditures: new Map(),
      };

      const bs = generateBalanceSheet(accounts, adjustments);

      const wc = bs.workingCapital.find((v) => v.month === "2026-01");
      // WC = (500000 + 150000) - 200000 = 450000
      expect(wc?.value).toBe(450000);
    });
  });
});
