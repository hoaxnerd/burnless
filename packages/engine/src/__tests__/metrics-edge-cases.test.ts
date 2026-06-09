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

    // MRR is 0 when there are no subscription (recurring) details — it must NOT
    // fall back to total revenue, which would relabel non-recurring revenue
    // (one-time / IAP / services / hardware) as recurring. See ARR below.
    expect(metrics.mrr[0]?.value).toBe(0);
    // ARR = MRR * 12 = 0
    expect(metrics.arr[0]?.value).toBe(0);
    // Revenue run rate is the total-revenue annualization and is unaffected
    expect(metrics.revenueRunRate[0]?.value).toBe(600000);
  });

  it("does not invent recurring revenue for a no-subscription business (IAP-only game)", () => {
    // A game whose only revenue is one-time in-app purchases has NO recurring
    // revenue, so MRR/ARR must be 0 — not its total transactional revenue.
    const input = makeBasicInput({
      revenue: new Map([["2026-01", 80000], ["2026-02", 120000]]),
      subscriptionDetails: [],
    });
    const metrics = computeAllMetrics(input);

    expect(metrics.mrr[0]?.value).toBe(0);
    expect(metrics.mrr[1]?.value).toBe(0);
    expect(metrics.arr[0]?.value).toBe(0);
    // Total revenue / run rate still reflect the real (non-recurring) money.
    expect(metrics.revenueRunRate[0]?.value).toBe(960000);
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
          customers: 100,
          newCustomers: 5,
          churnedCustomers: 3,
          mrr: 10000,
          newMrr: 500,
          expansionMrr: 0,
          churnedMrr: 300,
          netNewMrr: 200,
        },
        {
          month: "2026-02",
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
        revenue: new Map([["2026-01", 10000], ["2026-02", 9500]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // Churn rate = churned / beginning-of-period customers * 100 = 10 / 100 * 100 = 10%
      expect(metrics.customerChurnRate[1]?.value).toBe(10);
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

    // Re-baselined Phase 5.2: spend present but newCustomers===0 is its OWN
    // documented-undefined case (you spent acquisition $ but acquired nobody →
    // CAC is undefined, not a misleading 0). Distinct from the "no spend at all"
    // dark case below; both surface NaN so isMetricDataAvailable ghosts the card.
    it("returns NaN CAC when spend is present but no new customers", () => {
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
      expect(Number.isNaN(metrics.cac[0]?.value)).toBe(true);
    });

    // Phase 5.2 M2: the DARK case — acquisitionSpend is absent for the month
    // (input not present at all). Gate strictly on input presence → NaN, so the
    // card ghosts with a "needs acquisition spend" hint instead of showing $0.
    it("returns NaN CAC when no acquisitionSpend input at all", () => {
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
        // no acquisitionSpend provided
      });
      const metrics = computeAllMetrics(input);
      expect(Number.isNaN(metrics.cac[0]?.value)).toBe(true);
    });

    it("computes CAC = 600 on the positive path (6000 spend / 10 new)", () => {
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
        acquisitionSpend: new Map([["2026-01", 6000]]),
      });
      const metrics = computeAllMetrics(input);
      expect(metrics.cac[0]?.value).toBe(600);
    });

    // Phase 5.2: NaN propagates through the dependents that divide by CAC.
    it("ltvCacRatio and cacPaybackMonths inherit NaN when CAC is dark", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 110,
          newCustomers: 10,
          churnedCustomers: 2,
          mrr: 11000,
          newMrr: 1000,
          expansionMrr: 0,
          churnedMrr: 200,
          netNewMrr: 800,
        },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 11000]]),
        cogs: new Map([["2026-01", 2200]]), // 80% gross margin → nonzero gross/customer
        subscriptionDetails: subDetails,
        // no acquisitionSpend → CAC NaN
      });
      const metrics = computeAllMetrics(input);
      expect(Number.isNaN(metrics.cac[0]?.value)).toBe(true);
      expect(Number.isNaN(metrics.ltvCacRatio[0]?.value)).toBe(true);
      expect(Number.isNaN(metrics.cacPaybackMonths[0]?.value)).toBe(true);
    });
  });

  describe("LTV with gross margin", () => {
    it("includes gross margin in LTV calculation", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 95,
          newCustomers: 8,
          churnedCustomers: 3,
          mrr: 9500,
          newMrr: 800,
          expansionMrr: 100,
          churnedMrr: 300,
          netNewMrr: 600,
        },
        {
          month: "2026-02",
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
        revenue: new Map([["2026-01", 9500], ["2026-02", 10000]]),
        cogs: new Map([["2026-01", 1900], ["2026-02", 2000]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // Month 2: ARPA = 10000/100 = 100
      // Gross Margin = (10000 - 2000)/10000 = 80%
      // Revenue Churn Rate = 500 / 9500 * 100 ≈ 5.26%
      // LTV = (100 * 0.80) / 0.0526 ≈ 1520
      expect(metrics.ltv[1]?.value).toBeCloseTo(1520, -2);
    });

    // Phase 5.4: zero churn → infinite LTV. Re-baselined from the $1M sentinel
    // (999999) to NaN so isMetricDataAvailable ghosts the card with a hint
    // instead of showing a misleading concrete "$999,999 LTV". The dependent
    // ltvCacRatio that divides into LTV also goes NaN that month.
    it("emits NaN LTV when no revenue churn (100% retention → infinite)", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 90,
          newCustomers: 5,
          churnedCustomers: 0,
          mrr: 9000,
          newMrr: 500,
          expansionMrr: 0,
          churnedMrr: 0,
          netNewMrr: 500,
        },
        {
          month: "2026-02",
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
        revenue: new Map([["2026-01", 9000], ["2026-02", 10000]]),
        subscriptionDetails: subDetails,
        acquisitionSpend: new Map([["2026-01", 5000], ["2026-02", 6000]]),
      });
      const metrics = computeAllMetrics(input);
      // No revenue churn → LTV is infinite → NaN (not a $1M sentinel).
      expect(Number.isNaN(metrics.ltv[1]?.value)).toBe(true);
      // ltvCacRatio divides LTV/CAC; an infinite (NaN) LTV must inherit NaN.
      expect(Number.isNaN(metrics.ltvCacRatio[1]?.value)).toBe(true);
    });

    it("computes normal LTV when churn is positive (even with expansion)", () => {
      const subDetails: SubscriptionDetail[] = [
        {
          month: "2026-01",
          customers: 95,
          newCustomers: 8,
          churnedCustomers: 3,
          mrr: 9500,
          newMrr: 800,
          expansionMrr: 500,
          churnedMrr: 300,
          netNewMrr: 1000,
        },
        {
          month: "2026-02",
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
        revenue: new Map([["2026-01", 9500], ["2026-02", 10000]]),
        cogs: new Map([["2026-01", 1900], ["2026-02", 2000]]), // 80% gross margin
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      // Revenue churn rate = churnedMrr / prevMRR * 100 = 200 / 9500 * 100 ≈ 2.11%
      // ARPA = 10000/100 = 100, GM = 80%
      // LTV = (100 * 0.80) / 0.0211 ≈ 3800
      expect(metrics.ltv[1]?.value).toBeGreaterThan(3500);
      // Phase 5.4: positive churn → a finite real LTV (no $1M sentinel ceiling).
      expect(Number.isFinite(metrics.ltv[1]?.value)).toBe(true);
      expect(metrics.ltv[1]?.value).toBeLessThan(5000);
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
    // Uses default makeBasicInput operatingExpenses: 30000 (month 1), 31000 (month 2)
    const input = makeBasicInput({
      revenue: new Map([["2026-01", 50000], ["2026-02", 60000]]),
      cogs: new Map([["2026-01", 10000], ["2026-02", 12000]]),
      operatingExpenses: new Map([["2026-01", 30000], ["2026-02", 31000]]),
    });
    const metrics = computeAllMetrics(input);
    // Month 2: growth = (60000-50000)/50000*100 = 20%
    // GP = 60000-12000 = 48000, OpInc = 48000-31000 = 17000, EBITDA = 17000
    // EBITDA Margin = 17000/60000*100 ≈ 28.33%
    // Rule of 40 = 20 + 28.33 = 48.33
    expect(metrics.ruleOf40[1]?.value).toBeCloseTo(48.33, 1);
  });

  // ── Phase 5.3: NaN-gate magicNumber / customerRetentionCost / arpu ──────────
  // Each metric divides by (or is driven by) a specific INPUT that is optional on
  // MetricsInput. When that input is ABSENT, the dark value must be NaN — not 0 —
  // so isMetricDataAvailable ghosts the card with a hint instead of showing a
  // misleading $0 / 0.0x. Per review M2, "input present but the count is 0" is its
  // OWN documented-undefined case (also NaN) and is asserted separately.
  describe("Phase 5.3 — dark-metric NaN gating", () => {
    // magicNumber ← acquisitionSpend (prior month's S&M spend)
    it("returns NaN magicNumber when no acquisitionSpend input at all", () => {
      const subDetails: SubscriptionDetail[] = [
        { month: "2026-01", customers: 100, newCustomers: 0, churnedCustomers: 0, mrr: 10000, newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0 },
        { month: "2026-02", customers: 110, newCustomers: 10, churnedCustomers: 0, mrr: 11000, newMrr: 1000, expansionMrr: 0, churnedMrr: 0, netNewMrr: 1000 },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000], ["2026-02", 11000]]),
        subscriptionDetails: subDetails,
        // no acquisitionSpend provided → magicNumber is dark
      });
      const metrics = computeAllMetrics(input);
      // month index 1 (the monthly-approximation branch) divides by the prior
      // month's acquisitionSpend, which is absent → NaN.
      expect(Number.isNaN(metrics.magicNumber[1]?.value)).toBe(true);
    });

    it("computes a finite magicNumber when acquisitionSpend is present", () => {
      const subDetails: SubscriptionDetail[] = [
        { month: "2026-01", customers: 100, newCustomers: 0, churnedCustomers: 0, mrr: 10000, newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0 },
        { month: "2026-02", customers: 110, newCustomers: 10, churnedCustomers: 0, mrr: 11000, newMrr: 1000, expansionMrr: 0, churnedMrr: 0, netNewMrr: 1000 },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000], ["2026-02", 11000]]),
        subscriptionDetails: subDetails,
        // prior-month (2026-01) S&M spend present
        acquisitionSpend: new Map([["2026-01", 5000], ["2026-02", 6000]]),
      });
      const metrics = computeAllMetrics(input);
      // netNewArr = (11000-10000)*12 = 12000; / priorSpend 5000 = 2.4
      expect(metrics.magicNumber[1]?.value).toBe(2.4);
    });

    // customerRetentionCost ← retentionSpend
    it("returns NaN customerRetentionCost when no retentionSpend input at all", () => {
      const subDetails: SubscriptionDetail[] = [
        { month: "2026-01", customers: 100, newCustomers: 0, churnedCustomers: 0, mrr: 10000, newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0 },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
        // no retentionSpend provided → CRC is dark
      });
      const metrics = computeAllMetrics(input);
      expect(Number.isNaN(metrics.customerRetentionCost[0]?.value)).toBe(true);
    });

    // Review M2: retentionSpend PRESENT but customers === 0 is its own
    // documented-undefined case (you spent retention $ on zero customers) → NaN,
    // distinct from the "no retentionSpend at all" dark case above.
    it("returns NaN customerRetentionCost when spend is present but customers is 0", () => {
      const subDetails: SubscriptionDetail[] = [
        { month: "2026-01", customers: 0, newCustomers: 0, churnedCustomers: 0, mrr: 0, newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0 },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 0]]),
        subscriptionDetails: subDetails,
        retentionSpend: new Map([["2026-01", 5000]]),
      });
      const metrics = computeAllMetrics(input);
      expect(Number.isNaN(metrics.customerRetentionCost[0]?.value)).toBe(true);
    });

    it("computes a finite customerRetentionCost when both inputs are present", () => {
      const subDetails: SubscriptionDetail[] = [
        { month: "2026-01", customers: 100, newCustomers: 0, churnedCustomers: 0, mrr: 10000, newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0 },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
        retentionSpend: new Map([["2026-01", 5000]]),
      });
      const metrics = computeAllMetrics(input);
      expect(metrics.customerRetentionCost[0]?.value).toBe(50); // 5000 / 100
    });

    // arpu ← activeUsers (subDetail.activeUsers ?? input.activeUsers)
    it("returns NaN arpu when no active-user input at all", () => {
      const subDetails: SubscriptionDetail[] = [
        { month: "2026-01", customers: 100, newCustomers: 0, churnedCustomers: 0, mrr: 10000, newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0, activeUsers: undefined },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
        // no activeUsers series, subDetail.activeUsers undefined → ARPU is dark
      });
      const metrics = computeAllMetrics(input);
      expect(Number.isNaN(metrics.arpu[0]?.value)).toBe(true);
    });

    it("computes a finite arpu when active-user input is present", () => {
      const subDetails: SubscriptionDetail[] = [
        { month: "2026-01", customers: 100, newCustomers: 0, churnedCustomers: 0, mrr: 10000, newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0, activeUsers: 250 },
      ];
      const input = makeBasicInput({
        revenue: new Map([["2026-01", 10000]]),
        subscriptionDetails: subDetails,
      });
      const metrics = computeAllMetrics(input);
      expect(metrics.arpu[0]?.value).toBe(40); // 10000 / 250
    });
  });
});
