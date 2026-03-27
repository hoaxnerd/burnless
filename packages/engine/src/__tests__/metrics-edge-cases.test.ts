import { describe, it, expect } from "vitest";
import { computeAllMetrics, type MetricsInput } from "../metrics";
import type { SubscriptionDetail } from "../revenue";

describe("metrics — edge cases", () => {
  function makeBasicInput(overrides: Partial<MetricsInput> = {}): MetricsInput {
    return {
      revenue: new Map([["2026-01", 50000], ["2026-02", 55000]]),
      totalExpenses: new Map([["2026-01", 40000], ["2026-02", 42000]]),
      cogs: new Map([["2026-01", 10000], ["2026-02", 11000]]),
      operatingExpenses: new Map([["2026-01", 30000], ["2026-02", 31000]]),
      cashPosition: new Map([["2026-01", 500000], ["2026-02", 513000]]),
      netIncome: new Map([["2026-01", 10000], ["2026-02", 13000]]),
      headcount: new Map([["2026-01", 10], ["2026-02", 12]]),
      ...overrides,
    };
  }

  it("computes basic revenue metrics without subscription details", () => {
    const input = makeBasicInput();
    const metrics = computeAllMetrics(input);

    // MRR falls back to revenue when no subscription details
    expect(metrics.mrr[0]?.value).toBe(50000);
    // ARR = MRR * 12
    expect(metrics.arr[0]?.value).toBe(600000);
    // Revenue run rate = monthly * 12
    expect(metrics.revenueRunRate[0]?.value).toBe(600000);
  });

  it("computes gross profit and margin", () => {
    const input = makeBasicInput();
    const metrics = computeAllMetrics(input);

    // Gross profit = revenue - COGS
    expect(metrics.grossProfit[0]?.value).toBe(40000); // 50000 - 10000
    // Gross margin = 40000/50000 * 100 = 80%
    expect(metrics.grossMarginPercent[0]?.value).toBe(80);
  });

  it("computes operating income", () => {
    const input = makeBasicInput();
    const metrics = computeAllMetrics(input);

    // Operating income = gross profit - opex = 40000 - 30000 = 10000
    expect(metrics.operatingIncome[0]?.value).toBe(10000);
  });

  it("computes revenue growth rate (MoM)", () => {
    const input = makeBasicInput();
    const metrics = computeAllMetrics(input);

    // First month: 0% (no prior month)
    expect(metrics.revenueGrowthRate[0]?.value).toBe(0);
    // Second month: (55000-50000)/50000 * 100 = 10%
    expect(metrics.revenueGrowthRate[1]?.value).toBe(10);
  });

  it("computes revenue per employee (annualized)", () => {
    const input = makeBasicInput();
    const metrics = computeAllMetrics(input);

    // 50000 * 12 / 10 = 60000
    expect(metrics.revenuePerEmployee[0]?.value).toBe(60000);
  });

  it("handles zero revenue (no division by zero)", () => {
    const input = makeBasicInput({
      revenue: new Map([["2026-01", 0]]),
      cogs: new Map([["2026-01", 0]]),
      operatingExpenses: new Map([["2026-01", 5000]]),
      netIncome: new Map([["2026-01", -5000]]),
      totalExpenses: new Map([["2026-01", 5000]]),
      cashPosition: new Map([["2026-01", 100000]]),
      headcount: new Map([["2026-01", 5]]),
    });
    const metrics = computeAllMetrics(input);

    expect(metrics.grossMarginPercent[0]?.value).toBe(0);
    expect(metrics.revenuePerEmployee[0]?.value).toBe(0);
  });

  it("handles zero headcount (no division by zero)", () => {
    const input = makeBasicInput({
      headcount: new Map([["2026-01", 0], ["2026-02", 0]]),
    });
    const metrics = computeAllMetrics(input);
    expect(metrics.revenuePerEmployee[0]?.value).toBe(0);
  });

  it("handles net burn rate (capped at 0 when profitable)", () => {
    const input = makeBasicInput({
      revenue: new Map([["2026-01", 100000]]),
      totalExpenses: new Map([["2026-01", 50000]]),
    });
    const metrics = computeAllMetrics(input);
    // Revenue > expenses → net burn = 0
    expect(metrics.netBurnRate[0]?.value).toBe(0);
  });

  it("computes cash runway when burning cash", () => {
    const input = makeBasicInput({
      revenue: new Map([["2026-01", 10000]]),
      totalExpenses: new Map([["2026-01", 50000]]),
      cashPosition: new Map([["2026-01", 400000]]),
    });
    const metrics = computeAllMetrics(input);
    // Net burn = 50000 - 10000 = 40000
    // Runway = 400000 / 40000 = 10 months
    expect(metrics.cashRunwayMonths[0]?.value).toBe(10);
  });

  it("returns 999 runway when profitable (no burn)", () => {
    const input = makeBasicInput({
      revenue: new Map([["2026-01", 100000]]),
      totalExpenses: new Map([["2026-01", 50000]]),
      cashPosition: new Map([["2026-01", 500000]]),
    });
    const metrics = computeAllMetrics(input);
    expect(metrics.cashRunwayMonths[0]?.value).toBe(999);
  });

  describe("SaaS metrics with subscription details", () => {
    it("uses subscription details for MRR and customer metrics", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 10,
          churnedCustomers: 5,
          mrr: 10000,
          newMrr: 1000,
          expansionMrr: 200,
          churnedMrr: 500,
          netNewMrr: 700,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);

      expect(metrics.mrr[0]?.value).toBe(10000);
      expect(metrics.totalCustomers[0]?.value).toBe(100);
      expect(metrics.newCustomersPerMonth[0]?.value).toBe(10);
      expect(metrics.churnedCustomersPerMonth[0]?.value).toBe(5);
      expect(metrics.newMrr[0]?.value).toBe(1000);
      expect(metrics.expansionMrr[0]?.value).toBe(200);
      expect(metrics.churnedMrr[0]?.value).toBe(500);
      expect(metrics.netNewMrr[0]?.value).toBe(700);
    });

    it("computes customer churn rate", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 95,
          newCustomers: 5,
          churnedCustomers: 10,
          mrr: 9500,
          newMrr: 500,
          expansionMrr: 0,
          churnedMrr: 1000,
          netNewMrr: -500,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 9500]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // Churn rate = churned / (customers + churned) * 100 = 10 / (95+10) * 100 ≈ 9.52%
      expect(metrics.customerChurnRate[0]?.value).toBeCloseTo(9.52, 1);
    });

    it("computes ARPA correctly", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 0,
          churnedCustomers: 0,
          mrr: 5000,
          newMrr: 0,
          expansionMrr: 0,
          churnedMrr: 0,
          netNewMrr: 0,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 5000]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // ARPA = MRR / customers = 5000 / 100 = 50
      expect(metrics.arpa[0]?.value).toBe(50);
    });

    it("computes SaaS Quick Ratio", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 10,
          churnedCustomers: 2,
          mrr: 10000,
          newMrr: 1000,
          expansionMrr: 300,
          churnedMrr: 200,
          netNewMrr: 1100,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // Quick Ratio = (new + expansion) / churned = (1000+300) / 200 = 6.5
      expect(metrics.saasQuickRatio[0]?.value).toBe(6.5);
    });

    it("returns 999 Quick Ratio when no churn", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 10,
          churnedCustomers: 0,
          mrr: 10000,
          newMrr: 1000,
          expansionMrr: 200,
          churnedMrr: 0,
          netNewMrr: 1200,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      expect(metrics.saasQuickRatio[0]?.value).toBe(999);
    });

    it("computes CAC with acquisition spend", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 110,
          newCustomers: 10,
          churnedCustomers: 0,
          mrr: 11000,
          newMrr: 1000,
          expansionMrr: 0,
          churnedMrr: 0,
          netNewMrr: 1000,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 11000]]),
        subscriptionDetails: subDetails,
        acquisitionSpend: new Map([["2026-01", 5000]]),
      });
      const metrics = computeAllMetrics(input);
      // CAC = 5000 / 10 = 500
      expect(metrics.cac[0]?.value).toBe(500);
    });

    it("returns 0 CAC when no new customers", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 0,
          churnedCustomers: 5,
          mrr: 10000,
          newMrr: 0,
          expansionMrr: 0,
          churnedMrr: 500,
          netNewMrr: -500,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
        acquisitionSpend: new Map([["2026-01", 5000]]),
      });
      const metrics = computeAllMetrics(input);
      expect(metrics.cac[0]?.value).toBe(0);
    });
  });

  describe("LTV with gross margin", () => {
    it("includes gross margin in LTV calculation", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 10,
          churnedCustomers: 5,
          mrr: 10000,
          newMrr: 1000,
          expansionMrr: 200,
          churnedMrr: 500,
          netNewMrr: 700,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        cogs: new Map([["2026-01", 2000]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // ARPA = 10000/100 = 100
      // Gross Margin = (10000 - 2000)/10000 = 80%
      // Revenue Churn Rate = 500/(10000+500)*100 ≈ 4.76%
      // LTV = (100 * 0.80) / 0.0476 ≈ 1680.67
      expect(metrics.ltv[0]?.value).toBeCloseTo(1680.67, 0);
    });

    it("returns capped LTV when no revenue churn (100% retention)", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 10,
          churnedCustomers: 0,
          mrr: 10000,
          newMrr: 1000,
          expansionMrr: 0,
          churnedMrr: 0,
          netNewMrr: 1000,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // No revenue churn → LTV is infinite, capped at sentinel
      expect(metrics.ltv[0]?.value).toBe(999999);
    });

    it("computes normal LTV when churn is positive (even with expansion)", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 10,
          churnedCustomers: 2,
          mrr: 10000,
          newMrr: 1000,
          expansionMrr: 800,
          churnedMrr: 200,
          netNewMrr: 1600,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        cogs: new Map([["2026-01", 2000]]), // 80% gross margin
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // Revenue churn rate = churnedMrr / (mrr + churnedMrr) * 100
      // = 200 / (10000 + 200) * 100 ≈ 1.96%
      // ARPA = 10000/100 = 100, GM = 80%
      // LTV = (100 * 0.80) / 0.0196 ≈ 4081.63
      expect(metrics.ltv[0]?.value).toBeGreaterThan(4000);
      expect(metrics.ltv[0]?.value).toBeLessThan(999999);
    });

    it("returns 0 LTV when no revenue (even with zero churn)", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 0,
          newCustomers: 0,
          churnedCustomers: 0,
          mrr: 0,
          newMrr: 0,
          expansionMrr: 0,
          churnedMrr: 0,
          netNewMrr: 0,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 0]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // No ARPA → LTV = 0 (not capped)
      expect(metrics.ltv[0]?.value).toBe(0);
    });
  });

  describe("CAC Payback with gross margin", () => {
    it("includes gross margin in CAC Payback calculation", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 110,
          newCustomers: 10,
          churnedCustomers: 0,
          mrr: 11000,
          newMrr: 1000,
          expansionMrr: 0,
          churnedMrr: 0,
          netNewMrr: 1000,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 11000]]),
        cogs: new Map([["2026-01", 2200]]),
        subscriptionDetails: subDetails,
        acquisitionSpend: new Map([["2026-01", 5000]]),
      });
      const metrics = computeAllMetrics(input);
      // ARPA = 11000/110 = 100
      // Gross Margin = (11000 - 2200)/11000 = 80%
      // CAC = 5000 / 10 = 500
      // CAC Payback = 500 / (100 * 0.80) = 500 / 80 = 6.25 months
      expect(metrics.cacPaybackMonths[0]?.value).toBe(6.25);
    });

    it("returns 0 CAC Payback when no gross margin", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 100,
          newCustomers: 10,
          churnedCustomers: 0,
          mrr: 10000,
          newMrr: 1000,
          expansionMrr: 0,
          churnedMrr: 0,
          netNewMrr: 1000,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        cogs: new Map([["2026-01", 10000]]), // 0% margin
        subscriptionDetails: subDetails,
        acquisitionSpend: new Map([["2026-01", 5000]]),
      });
      const metrics = computeAllMetrics(input);
      expect(metrics.cacPaybackMonths[0]?.value).toBe(0);
    });
  });

  it("computes Rule of 40", () => {
    const input = makeBasicInput({
      revenue: new Map([["2026-01", 50000], ["2026-02", 60000]]),
      cogs: new Map([["2026-01", 10000], ["2026-02", 12000]]),
    });
    const metrics = computeAllMetrics(input);
    // Month 2: growth = (60000-50000)/50000*100 = 20%, margin = (60000-12000)/60000*100 = 80%
    // Rule of 40 = 20 + 80 = 100
    expect(metrics.ruleOf40[1]?.value).toBe(100);
  });
});
