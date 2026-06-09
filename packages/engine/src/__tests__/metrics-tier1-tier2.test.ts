import { describe, it, expect } from "vitest";
import { computeAllMetrics, type MetricsInput } from "../metrics";
import type { SubscriptionDetail } from "../revenue";
import type { MonthlySeries } from "../utils";

function makeSeries(values: Record<string, number>): MonthlySeries {
  return new Map(Object.entries(values));
}

/**
 * Builds a 3-month test input with subscription details and optional overrides.
 * Months: 2026-01, 2026-02, 2026-03
 */
function make3MonthInput(overrides: Partial<MetricsInput> = {}, subOverrides?: Partial<SubscriptionDetail>[]): MetricsInput {
  const subDetails: SubscriptionDetail[] = [
    {
      month: "2026-01",
      customers: 100,
      newCustomers: 10,
      churnedCustomers: 5,
      mrr: 10000,
      newMrr: 1000,
      expansionMrr: 200,
      churnedMrr: 400,
      contractionMrr: 100,
      downgradeMrr: 100,
      netNewMrr: 700,
      activeUsers: 250,
      ...(subOverrides?.[0] ?? {}),
    },
    {
      month: "2026-02",
      customers: 105,
      newCustomers: 12,
      churnedCustomers: 7,
      mrr: 10700,
      newMrr: 1200,
      expansionMrr: 300,
      churnedMrr: 500,
      contractionMrr: 200,
      downgradeMrr: 200,
      netNewMrr: 800,
      activeUsers: 270,
      ...(subOverrides?.[1] ?? {}),
    },
    {
      month: "2026-03",
      customers: 110,
      newCustomers: 15,
      churnedCustomers: 10,
      mrr: 11500,
      newMrr: 1500,
      expansionMrr: 400,
      churnedMrr: 600,
      contractionMrr: 100,
      downgradeMrr: 100,
      netNewMrr: 1200,
      activeUsers: 300,
      ...(subOverrides?.[2] ?? {}),
    },
  ];

  return {
    revenue: makeSeries({ "2026-01": 10000, "2026-02": 10700, "2026-03": 11500 }),
    subscriptionDetails: subDetails,
    totalExpenses: makeSeries({ "2026-01": 15000, "2026-02": 15500, "2026-03": 16000 }),
    cogs: makeSeries({ "2026-01": 2000, "2026-02": 2100, "2026-03": 2200 }),
    operatingExpenses: makeSeries({ "2026-01": 13000, "2026-02": 13400, "2026-03": 13800 }),
    cashPosition: makeSeries({ "2026-01": 500000, "2026-02": 495200, "2026-03": 490700 }),
    netIncome: makeSeries({ "2026-01": -5000, "2026-02": -4800, "2026-03": -4500 }),
    headcount: makeSeries({ "2026-01": 10, "2026-02": 11, "2026-03": 12 }),
    ...overrides,
  };
}

describe("Tier-1 Metrics", () => {
  describe("MRR Decomposition — contractionMrr & downgradeMrr", () => {
    it("extracts contraction and downgrade MRR from subscription details", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);

      expect(m.contractionMrr[0]?.value).toBe(100);
      expect(m.contractionMrr[1]?.value).toBe(200);
      expect(m.downgradeMrr[0]?.value).toBe(100);
      expect(m.downgradeMrr[1]?.value).toBe(200);
    });

    it("returns 0 when no contraction data provided", () => {
      const input = make3MonthInput({}, [
        { contractionMrr: undefined, downgradeMrr: undefined },
        { contractionMrr: undefined, downgradeMrr: undefined },
        { contractionMrr: undefined, downgradeMrr: undefined },
      ]);
      const m = computeAllMetrics(input);
      expect(m.contractionMrr[0]?.value).toBe(0);
      expect(m.downgradeMrr[0]?.value).toBe(0);
    });

    it("falls back to downgradeMrr when contractionMrr is missing", () => {
      const input = make3MonthInput({}, [
        { contractionMrr: undefined, downgradeMrr: 150 },
      ]);
      const m = computeAllMetrics(input);
      expect(m.contractionMrr[0]?.value).toBe(150);
    });

    it("includes contractionMrr in SaaS Quick Ratio losses", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);
      // Quick Ratio = (newMrr + expansionMrr) / (churnedMrr + contractionMrr)
      // Month 1: (1000 + 200) / (400 + 100) = 1200/500 = 2.4
      expect(m.saasQuickRatio[0]?.value).toBe(2.4);
    });
  });

  describe("Net Revenue Retention (NRR)", () => {
    it("computes NRR as (Ending MRR - New MRR) / Prior MRR × 100", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);

      // Month 1: no prior, should be 0
      expect(m.netRevenueRetention[0]?.value).toBe(0);
      // Month 2: (10700 - 1200) / 10000 × 100 = 95%
      expect(m.netRevenueRetention[1]?.value).toBe(95);
    });

    it("returns >100% when expansion exceeds churn (healthy)", () => {
      const input = make3MonthInput({}, [
        { mrr: 10000, newMrr: 500 },
        { mrr: 11000, newMrr: 200 }, // NRR = (11000-200)/10000*100 = 108%
      ]);
      const m = computeAllMetrics(input);
      expect(m.netRevenueRetention[1]?.value).toBe(108);
    });

    it("handles zero prior MRR gracefully", () => {
      const input = make3MonthInput({}, [
        { mrr: 0 },
      ]);
      const m = computeAllMetrics(input);
      expect(m.netRevenueRetention[1]?.value).toBe(0);
    });
  });

  describe("Gross Revenue Retention (GRR)", () => {
    it("computes GRR as (1 - (churned + downgrade)/priorMRR) × 100", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);

      // Month 1: no prior, 0
      expect(m.grossRevenueRetention[0]?.value).toBe(0);
      // Month 2: 1 - (500 + 200) / 10000 × 100 = 93%
      expect(m.grossRevenueRetention[1]?.value).toBe(93);
    });

    it("never exceeds 100%", () => {
      const input = make3MonthInput({}, [
        { mrr: 10000 },
        { churnedMrr: 0, contractionMrr: 0, downgradeMrr: 0 },
      ]);
      const m = computeAllMetrics(input);
      expect(m.grossRevenueRetention[1]?.value).toBe(100);
    });

    it("handles zero prior MRR gracefully", () => {
      const input = make3MonthInput({}, [{ mrr: 0 }]);
      const m = computeAllMetrics(input);
      expect(m.grossRevenueRetention[1]?.value).toBe(0);
    });
  });

  describe("Free Cash Flow (FCF)", () => {
    it("computes FCF = Operating Cash Flow - CapEx", () => {
      const input = make3MonthInput({
        operatingCashFlow: makeSeries({ "2026-01": 5000, "2026-02": 6000, "2026-03": 7000 }),
        capex: makeSeries({ "2026-01": 2000, "2026-02": 2500, "2026-03": 3000 }),
      });
      const m = computeAllMetrics(input);
      expect(m.freeCashFlow[0]?.value).toBe(3000);
      expect(m.freeCashFlow[1]?.value).toBe(3500);
      expect(m.freeCashFlow[2]?.value).toBe(4000);
    });

    it("falls back to netIncome when operatingCashFlow not provided", () => {
      const input = make3MonthInput({
        capex: makeSeries({ "2026-01": 1000 }),
      });
      const m = computeAllMetrics(input);
      // FCF = netIncome(-5000) - capex(1000) = -6000
      expect(m.freeCashFlow[0]?.value).toBe(-6000);
    });

    it("handles no capex", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);
      // FCF = netIncome - 0 capex
      expect(m.freeCashFlow[0]?.value).toBe(-5000);
    });
  });

  describe("FCF Margin", () => {
    it("computes FCF Margin = FCF / Revenue × 100", () => {
      const input = make3MonthInput({
        operatingCashFlow: makeSeries({ "2026-01": 3000 }),
        capex: makeSeries({ "2026-01": 1000 }),
      });
      const m = computeAllMetrics(input);
      // FCF = 2000, Revenue = 10000 → Margin = 20%
      expect(m.fcfMargin[0]?.value).toBe(20);
    });

    it("returns 0 when revenue is zero", () => {
      const input = make3MonthInput({
        revenue: makeSeries({ "2026-01": 0 }),
      });
      const m = computeAllMetrics(input);
      expect(m.fcfMargin[0]?.value).toBe(0);
    });
  });

  describe("TTM Revenue (Trailing Twelve Months)", () => {
    it("sums last 12 months of revenue (or all available if <12)", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);

      // Month 1: just 10000
      expect(m.ttmRevenue[0]?.value).toBe(10000);
      // Month 2: 10000 + 10700
      expect(m.ttmRevenue[1]?.value).toBe(20700);
      // Month 3: 10000 + 10700 + 11500
      expect(m.ttmRevenue[2]?.value).toBe(32200);
    });

    it("uses 12-month window when enough data", () => {
      const months: Record<string, number> = {};
      for (let i = 1; i <= 15; i++) {
        const key = `2026-${String(i).padStart(2, "0")}`;
        months[key] = 1000 * i; // 1000, 2000, ..., 15000
      }
      const input: MetricsInput = {
        revenue: makeSeries(months),
        totalExpenses: makeSeries(months),
        cogs: makeSeries(months),
        operatingExpenses: makeSeries(months),
        cashPosition: makeSeries(months),
        netIncome: makeSeries(months),
        headcount: makeSeries(months),
      };
      const m = computeAllMetrics(input);

      // Month 12 (2026-12): sum of months 1-12 = 1000+2000+...+12000 = 78000
      expect(m.ttmRevenue[11]?.value).toBe(78000);
      // Month 13 (2027-01): sum of months 2-13 = 2000+...+13000 = 78000 + 13000 - 1000 = 90000
      expect(m.ttmRevenue[12]?.value).toBe(90000);
    });
  });
});

describe("Tier-2 Metrics", () => {
  describe("ARPU (Average Revenue Per User)", () => {
    it("computes ARPU = MRR / active users from subscription details", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);
      // Month 1: 10000/250 = 40
      expect(m.arpu[0]?.value).toBe(40);
      // Month 2: 10700/270 ≈ 39.63
      expect(m.arpu[1]?.value).toBeCloseTo(39.63, 1);
    });

    it("falls back to activeUsers from MetricsInput", () => {
      const input = make3MonthInput({
        activeUsers: makeSeries({ "2026-01": 500, "2026-02": 550, "2026-03": 600 }),
      }, [
        { activeUsers: undefined },
        { activeUsers: undefined },
        { activeUsers: undefined },
      ]);
      const m = computeAllMetrics(input);
      // Month 1: 10000/500 = 20
      expect(m.arpu[0]?.value).toBe(20);
    });

    it("returns 0 when no user data available", () => {
      const input = make3MonthInput({}, [
        { activeUsers: undefined },
        { activeUsers: undefined },
        { activeUsers: undefined },
      ]);
      const m = computeAllMetrics(input);
      expect(m.arpu[0]?.value).toBe(0);
    });
  });

  describe("Negative Churn Detection", () => {
    it("detects negative churn when expansion > churn", () => {
      const input = make3MonthInput({}, [
        { mrr: 10000 },
        { churnedMrr: 200, expansionMrr: 500 }, // expansion > churn
      ]);
      const m = computeAllMetrics(input);
      // netChurnRate = (200 - 500) / 10000 × 100 = -3%
      expect(m.netChurnRate[1]?.value).toBe(-3);
      expect(m.hasNegativeChurn[1]?.value).toBe(1); // flagged as negative churn (good)
    });

    it("returns positive churn when churn > expansion", () => {
      const input = make3MonthInput({}, [
        { mrr: 10000 },
        { churnedMrr: 500, expansionMrr: 200 },
      ]);
      const m = computeAllMetrics(input);
      // netChurnRate = (500 - 200) / 10000 × 100 = 3%
      expect(m.netChurnRate[1]?.value).toBe(3);
      expect(m.hasNegativeChurn[1]?.value).toBe(0);
    });

    it("first month is always 0", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);
      expect(m.netChurnRate[0]?.value).toBe(0);
      expect(m.hasNegativeChurn[0]?.value).toBe(0);
    });
  });

  describe("Burn Productivity", () => {
    it("returns 0 for less than 12 months of data", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);
      expect(m.burnProductivity[0]?.value).toBe(0);
      expect(m.burnProductivity[1]?.value).toBe(0);
      expect(m.burnProductivity[2]?.value).toBe(0);
    });

    it("computes correctly with 12+ months of data", () => {
      // Build 13 months of data with increasing gross profit
      const months: Record<string, number> = {};
      const opex: Record<string, number> = {};
      const cogs: Record<string, number> = {};
      for (let i = 1; i <= 13; i++) {
        const key = i <= 12
          ? `2026-${String(i).padStart(2, "0")}`
          : `2027-01`;
        months[key] = 10000 + i * 1000; // revenue growing
        cogs[key] = 2000; // constant COGS
        opex[key] = 5000; // constant OpEx
      }
      const input: MetricsInput = {
        revenue: makeSeries(months),
        totalExpenses: makeSeries(Object.fromEntries(
          Object.entries(months).map(([k]) => [k, 7000]) // cogs + opex
        )),
        cogs: makeSeries(cogs),
        operatingExpenses: makeSeries(opex),
        cashPosition: makeSeries(Object.fromEntries(
          Object.entries(months).map(([k]) => [k, 100000])
        )),
        netIncome: makeSeries(Object.fromEntries(
          Object.entries(months).map(([k, v]) => [k, v - 7000])
        )),
        headcount: makeSeries(Object.fromEntries(
          Object.entries(months).map(([k]) => [k, 10])
        )),
      };
      const m = computeAllMetrics(input);
      // Month 12 (index 11): burnProductivity should be non-zero
      expect(m.burnProductivity[11]?.value).not.toBe(0);
    });
  });

  describe("Working Capital", () => {
    it("computes Working Capital = Current Assets - Current Liabilities", () => {
      const input = make3MonthInput({
        currentAssets: makeSeries({ "2026-01": 200000, "2026-02": 210000, "2026-03": 220000 }),
        currentLiabilities: makeSeries({ "2026-01": 80000, "2026-02": 85000, "2026-03": 90000 }),
      });
      const m = computeAllMetrics(input);
      expect(m.workingCapital[0]?.value).toBe(120000);
      expect(m.workingCapital[1]?.value).toBe(125000);
      expect(m.workingCapital[2]?.value).toBe(130000);
    });

    it("returns 0 when no balance sheet data provided", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);
      expect(m.workingCapital[0]?.value).toBe(0);
    });

    it("handles negative working capital", () => {
      const input = make3MonthInput({
        currentAssets: makeSeries({ "2026-01": 50000 }),
        currentLiabilities: makeSeries({ "2026-01": 80000 }),
      });
      const m = computeAllMetrics(input);
      expect(m.workingCapital[0]?.value).toBe(-30000);
    });
  });

  describe("Customer Retention Cost (CRC)", () => {
    it("computes CRC = Retention Spend / Active Customers", () => {
      const input = make3MonthInput({
        retentionSpend: makeSeries({ "2026-01": 5000, "2026-02": 6000, "2026-03": 7000 }),
      });
      const m = computeAllMetrics(input);
      // Month 1: 5000/100 = 50
      expect(m.customerRetentionCost[0]?.value).toBe(50);
      // Month 2: 6000/105 ≈ 57.14
      expect(m.customerRetentionCost[1]?.value).toBeCloseTo(57.14, 1);
    });

    it("returns 0 when no retention spend", () => {
      const input = make3MonthInput();
      const m = computeAllMetrics(input);
      expect(m.customerRetentionCost[0]?.value).toBe(0);
    });

    it("returns 0 when no customers", () => {
      const input = make3MonthInput({
        retentionSpend: makeSeries({ "2026-01": 5000 }),
      }, [{ customers: 0 }]);
      const m = computeAllMetrics(input);
      expect(m.customerRetentionCost[0]?.value).toBe(0);
    });
  });
});

describe("Edge Cases — All New Metrics", () => {
  it("handles single month of data", () => {
    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 10000 }),
      subscriptionDetails: [{
        month: "2026-01",
        customers: 50,
        newCustomers: 5,
        churnedCustomers: 2,
        mrr: 10000,
        newMrr: 500,
        expansionMrr: 100,
        churnedMrr: 200,
        contractionMrr: 50,
        downgradeMrr: 50,
        netNewMrr: 350,
        activeUsers: 120,
      }],
      totalExpenses: makeSeries({ "2026-01": 12000 }),
      cogs: makeSeries({ "2026-01": 3000 }),
      operatingExpenses: makeSeries({ "2026-01": 9000 }),
      cashPosition: makeSeries({ "2026-01": 100000 }),
      netIncome: makeSeries({ "2026-01": -2000 }),
      headcount: makeSeries({ "2026-01": 5 }),
      capex: makeSeries({ "2026-01": 500 }),
      currentAssets: makeSeries({ "2026-01": 120000 }),
      currentLiabilities: makeSeries({ "2026-01": 30000 }),
      retentionSpend: makeSeries({ "2026-01": 2000 }),
      activeUsers: makeSeries({ "2026-01": 120 }),
    };
    const m = computeAllMetrics(input);

    // All first-month retention metrics should be 0 (no prior month)
    expect(m.netRevenueRetention[0]?.value).toBe(0);
    expect(m.grossRevenueRetention[0]?.value).toBe(0);
    expect(m.netChurnRate[0]?.value).toBe(0);

    // FCF should work
    expect(m.freeCashFlow[0]?.value).toBe(-2500); // -2000 - 500

    // TTM = single month revenue
    expect(m.ttmRevenue[0]?.value).toBe(10000);

    // ARPU = 10000/120 ≈ 83.33
    expect(m.arpu[0]?.value).toBeCloseTo(83.33, 1);

    // Working Capital
    expect(m.workingCapital[0]?.value).toBe(90000);

    // CRC = 2000/50 = 40
    expect(m.customerRetentionCost[0]?.value).toBe(40);

    // Burn Productivity = 0 (need 12 months)
    expect(m.burnProductivity[0]?.value).toBe(0);
  });

  it("handles zero revenue across all new metrics without errors", () => {
    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 0, "2026-02": 0 }),
      totalExpenses: makeSeries({ "2026-01": 0, "2026-02": 0 }),
      cogs: makeSeries({ "2026-01": 0, "2026-02": 0 }),
      operatingExpenses: makeSeries({ "2026-01": 0, "2026-02": 0 }),
      cashPosition: makeSeries({ "2026-01": 0, "2026-02": 0 }),
      netIncome: makeSeries({ "2026-01": 0, "2026-02": 0 }),
      headcount: makeSeries({ "2026-01": 0, "2026-02": 0 }),
    };
    const m = computeAllMetrics(input);

    expect(m.netRevenueRetention[1]?.value).toBe(0);
    expect(m.grossRevenueRetention[1]?.value).toBe(0);
    expect(m.freeCashFlow[0]?.value).toBe(0);
    expect(m.fcfMargin[0]?.value).toBe(0);
    expect(m.ttmRevenue[0]?.value).toBe(0);
    expect(m.arpu[0]?.value).toBe(0);
    expect(m.netChurnRate[1]?.value).toBe(0);
    expect(m.workingCapital[0]?.value).toBe(0);
    expect(m.customerRetentionCost[0]?.value).toBe(0);
    expect(m.burnProductivity[0]?.value).toBe(0);
  });
});

// Phase 5 Task 5.1 §1.4 D6 — interestExpense surfaced as a ComputedMetrics slug.
describe("interestExpense metric (Phase 5 Task 5.1)", () => {
  it("echoes the per-month input.interestExpense series", () => {
    const input = make3MonthInput({
      interestExpense: makeSeries({ "2026-01": 1250.5, "2026-02": 1300, "2026-03": 1349.25 }),
    });
    const m = computeAllMetrics(input);

    expect(m.interestExpense[0]?.value).toBe(1250.5);
    expect(m.interestExpense[1]?.value).toBe(1300);
    expect(m.interestExpense[2]?.value).toBe(1349.25);
  });

  it("is 0 each month when no interestExpense input is provided", () => {
    const input = make3MonthInput();
    const m = computeAllMetrics(input);

    expect(m.interestExpense[0]?.value).toBe(0);
    expect(m.interestExpense[1]?.value).toBe(0);
    expect(m.interestExpense[2]?.value).toBe(0);
  });
});
