/**
 * Hand-calculated formula verification tests for all SaaS / financial metrics.
 *
 * Each test uses a small, controlled data set where the expected value can be
 * verified by hand with a calculator.  This catches formula mistakes,
 * off-by-one index errors, and rounding issues.
 */

import { describe, it, expect } from "vitest";
import {
  computeAllMetrics,
  computeCustomMetrics,
  type MetricsInput,
  type CustomMetricDefinition,
} from "../metrics";
import type { SubscriptionDetail } from "../revenue";
import type { MonthlySeries } from "../utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function s(vals: Record<string, number>): MonthlySeries {
  return new Map(Object.entries(vals));
}

function sub(overrides: Partial<SubscriptionDetail> & { month: string }): SubscriptionDetail {
  return {
    customers: 0,
    newCustomers: 0,
    churnedCustomers: 0,
    mrr: 0,
    newMrr: 0,
    expansionMrr: 0,
    churnedMrr: 0,
    netNewMrr: 0,
    ...overrides,
  };
}

// ── Magic Number ─────────────────────────────────────────────────────────────

describe("Magic Number — hand-calculated", () => {
  it("quarterly: Net New ARR (QoQ) / Prior Quarter S&M", () => {
    // MRR: 10k, 11k, 12k, 14k (4 months)
    // At index 3: currMrr = 14000, qtrAgoMrr (index 0) = 10000
    // Net New ARR = (14000 - 10000) * 12 = 48000  (annualize quarterly MRR change to ARR)
    // Prior quarter S&M (months 0..2): 5000 + 5000 + 5000 = 15000
    // Magic Number = 48000 / 15000 = 3.2
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 10000 }),
      sub({ month: "2026-02", mrr: 11000 }),
      sub({ month: "2026-03", mrr: 12000 }),
      sub({ month: "2026-04", mrr: 14000 }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 10000, "2026-02": 11000, "2026-03": 12000, "2026-04": 14000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 20000, "2026-02": 20000, "2026-03": 20000, "2026-04": 20000 }),
      cogs: s({ "2026-01": 2000, "2026-02": 2000, "2026-03": 2000, "2026-04": 2000 }),
      operatingExpenses: s({ "2026-01": 18000, "2026-02": 18000, "2026-03": 18000, "2026-04": 18000 }),
      cashPosition: s({ "2026-01": 500000, "2026-02": 490000, "2026-03": 480000, "2026-04": 470000 }),
      netIncome: s({ "2026-01": -10000, "2026-02": -9000, "2026-03": -8000, "2026-04": -6000 }),
      headcount: s({ "2026-01": 10, "2026-02": 10, "2026-03": 10, "2026-04": 10 }),
      acquisitionSpend: s({ "2026-01": 5000, "2026-02": 5000, "2026-03": 5000, "2026-04": 5000 }),
    };

    const m = computeAllMetrics(input);
    expect(m.magicNumber[3]?.value).toBeCloseTo(3.2, 1);
  });

  it("monthly fallback for months < 3", () => {
    // Month 2 (index 1): Net New ARR = (11000 - 10000) * 12 = 12000
    // Prev S&M = 5000
    // Magic Number = 12000 / 5000 = 2.4
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 10000 }),
      sub({ month: "2026-02", mrr: 11000 }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 10000, "2026-02": 11000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 20000, "2026-02": 20000 }),
      cogs: s({ "2026-01": 2000, "2026-02": 2000 }),
      operatingExpenses: s({ "2026-01": 18000, "2026-02": 18000 }),
      cashPosition: s({ "2026-01": 500000, "2026-02": 490000 }),
      netIncome: s({ "2026-01": -10000, "2026-02": -9000 }),
      headcount: s({ "2026-01": 10, "2026-02": 10 }),
      acquisitionSpend: s({ "2026-01": 5000, "2026-02": 5000 }),
    };

    const m = computeAllMetrics(input);
    expect(m.magicNumber[0]?.value).toBe(0); // first month, no prior
    expect(m.magicNumber[1]?.value).toBe(2.4);
  });

  // Re-baselined Phase 5.3: no acquisitionSpend is the DARK case (input absent) —
  // magicNumber is NaN, not a misleading 0, so isMetricDataAvailable ghosts the card.
  it("returns NaN when no S&M spend (dark — acquisitionSpend absent)", () => {
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 10000 }),
      sub({ month: "2026-02", mrr: 12000 }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 10000, "2026-02": 12000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 15000, "2026-02": 15000 }),
      cogs: s({ "2026-01": 2000, "2026-02": 2000 }),
      operatingExpenses: s({ "2026-01": 13000, "2026-02": 13000 }),
      cashPosition: s({ "2026-01": 500000, "2026-02": 497000 }),
      netIncome: s({ "2026-01": -5000, "2026-02": -3000 }),
      headcount: s({ "2026-01": 10, "2026-02": 10 }),
      // no acquisitionSpend
    };
    const m = computeAllMetrics(input);
    expect(Number.isNaN(m.magicNumber[1]?.value)).toBe(true);
  });
});

// ── Net New MRR — 5-term re-derivation (Phase 6 §6.1) ────────────────────────

describe("Net New MRR — re-derived from 5 components", () => {
  // Canonical: New + Expansion + Reactivation − Churned − Contraction.
  // The engine MUST re-derive from the components and IGNORE any value carried
  // on the subDetail's own netNewMrr field (which a buggy/poisoned producer
  // could set wrong).
  it("re-derives from all 5 components, ignoring poisoned subDetail.netNewMrr", () => {
    // 1000 + 200 + 50 − 300 − 80 = 870 (NOT the poisoned 9999)
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        mrr: 5000,
        newMrr: 1000,
        expansionMrr: 200,
        reactivationMrr: 50,
        churnedMrr: 300,
        contractionMrr: 80,
        netNewMrr: 9999, // poisoned — must be ignored
      }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 5000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 8000 }),
      cogs: s({ "2026-01": 1000 }),
      operatingExpenses: s({ "2026-01": 7000 }),
      cashPosition: s({ "2026-01": 100000 }),
      netIncome: s({ "2026-01": -3000 }),
      headcount: s({ "2026-01": 5 }),
    };
    const m = computeAllMetrics(input);
    expect(m.netNewMrr[0]?.value).toBe(870);
  });

  it("uses downgradeMrr as the contraction alias when contractionMrr absent", () => {
    // 1000 + 200 + 0 − 300 − 80 = 820 (no reactivation; downgrade=80 is contraction)
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        mrr: 5000,
        newMrr: 1000,
        expansionMrr: 200,
        churnedMrr: 300,
        downgradeMrr: 80, // alias for contractionMrr
        netNewMrr: 9999, // poisoned — must be ignored
      }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 5000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 8000 }),
      cogs: s({ "2026-01": 1000 }),
      operatingExpenses: s({ "2026-01": 7000 }),
      cashPosition: s({ "2026-01": 100000 }),
      netIncome: s({ "2026-01": -3000 }),
      headcount: s({ "2026-01": 5 }),
    };
    const m = computeAllMetrics(input);
    expect(m.netNewMrr[0]?.value).toBe(820);
  });

  it("3-term collapse: new − churned when contraction/reactivation absent", () => {
    // 250 + 0 + 0 − 50 − 0 = 200
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        mrr: 3000,
        newMrr: 250,
        churnedMrr: 50,
        netNewMrr: 9999, // poisoned — must be ignored
      }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 3000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 5000 }),
      cogs: s({ "2026-01": 800 }),
      operatingExpenses: s({ "2026-01": 4200 }),
      cashPosition: s({ "2026-01": 100000 }),
      netIncome: s({ "2026-01": -2000 }),
      headcount: s({ "2026-01": 4 }),
    };
    const m = computeAllMetrics(input);
    expect(m.netNewMrr[0]?.value).toBe(200);
  });
});

// ── Burn Multiple ────────────────────────────────────────────────────────────

describe("Burn Multiple — hand-calculated", () => {
  it("Burn Multiple = Net Burn / Net New MRR", () => {
    // Net Burn = max(0, expenses - revenue) = max(0, 20000 - 12000) = 8000
    // Net New MRR = 1500 (re-derived: newMrr 1500, no churn/contraction)
    // Burn Multiple = 8000 / 1500 ≈ 5.33
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 12000, newMrr: 1500, netNewMrr: 1500 }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 12000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 20000 }),
      cogs: s({ "2026-01": 3000 }),
      operatingExpenses: s({ "2026-01": 17000 }),
      cashPosition: s({ "2026-01": 300000 }),
      netIncome: s({ "2026-01": -8000 }),
      headcount: s({ "2026-01": 8 }),
    };
    const m = computeAllMetrics(input);
    expect(m.burnMultiple[0]?.value).toBeCloseTo(5.33, 1);
  });

  it("returns 999 sentinel when Net New MRR ≤ 0 and burning cash", () => {
    // Net New MRR = -500 (re-derived: churnedMrr 500, no new/expansion)
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 10000, churnedMrr: 500, netNewMrr: -500 }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 10000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 15000 }),
      cogs: s({ "2026-01": 2000 }),
      operatingExpenses: s({ "2026-01": 13000 }),
      cashPosition: s({ "2026-01": 200000 }),
      netIncome: s({ "2026-01": -5000 }),
      headcount: s({ "2026-01": 5 }),
    };
    const m = computeAllMetrics(input);
    expect(m.burnMultiple[0]?.value).toBe(999);
  });

  it("returns 0 when profitable (no burn)", () => {
    // Net New MRR = 2000 (re-derived: newMrr 2000, no churn/contraction)
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 50000, newMrr: 2000, netNewMrr: 2000 }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 50000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 40000 }),
      cogs: s({ "2026-01": 10000 }),
      operatingExpenses: s({ "2026-01": 30000 }),
      cashPosition: s({ "2026-01": 500000 }),
      netIncome: s({ "2026-01": 10000 }),
      headcount: s({ "2026-01": 20 }),
    };
    const m = computeAllMetrics(input);
    // Net burn = max(0, 40000 - 50000) = 0 → burn multiple = 0/2000 = 0
    expect(m.burnMultiple[0]?.value).toBe(0);
  });
});

// ── LTV:CAC Ratio ────────────────────────────────────────────────────────────

describe("LTV:CAC Ratio — hand-calculated", () => {
  it("LTV:CAC = LTV / CAC", () => {
    // Month 2 (index 1):
    // ARPA = 20000 / 200 = 100
    // Gross Margin = (20000 - 4000) / 20000 = 80%
    // Revenue Churn Rate = churnedMrr / prevMRR * 100 = 1000 / 18000 * 100 ≈ 5.56%
    // LTV = (100 * 0.80) / 0.0556 ≈ 1440
    // CAC = 8000 / 20 = 400
    // LTV:CAC = 1440 / 400 ≈ 3.60
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        customers: 190,
        newCustomers: 15,
        churnedCustomers: 5,
        mrr: 18000,
        newMrr: 1500,
        expansionMrr: 300,
        churnedMrr: 500,
        netNewMrr: 1300,
      }),
      sub({
        month: "2026-02",
        customers: 200,
        newCustomers: 20,
        churnedCustomers: 10,
        mrr: 20000,
        newMrr: 2000,
        expansionMrr: 500,
        churnedMrr: 1000,
        netNewMrr: 1500,
      }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 18000, "2026-02": 20000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 23000, "2026-02": 25000 }),
      cogs: s({ "2026-01": 3600, "2026-02": 4000 }),
      operatingExpenses: s({ "2026-01": 19400, "2026-02": 21000 }),
      cashPosition: s({ "2026-01": 500000, "2026-02": 495000 }),
      netIncome: s({ "2026-01": -5000, "2026-02": -5000 }),
      headcount: s({ "2026-01": 15, "2026-02": 15 }),
      acquisitionSpend: s({ "2026-01": 8000, "2026-02": 8000 }),
    };

    const m = computeAllMetrics(input);
    // Revenue churn = 1000 / 18000 * 100 ≈ 5.56%
    // ARPA = 20000/200 = 100, GM = 80%
    // LTV = (100 * 0.80) / 0.0556 ≈ 1440
    expect(m.ltv[1]?.value).toBeCloseTo(1440, -1);
    expect(m.cac[1]?.value).toBe(400);
    expect(m.ltvCacRatio[1]?.value).toBeCloseTo(3.6, 0);
  });

  // Re-baselined Phase 5.2: with no acquisitionSpend input, CAC is a DARK metric
  // (gated on input presence) → NaN, and ltvCacRatio inherits NaN. Previously this
  // emitted a misleading 0; NaN lets isMetricDataAvailable ghost the card.
  it("returns NaN when there is no acquisition spend (CAC is dark)", () => {
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        customers: 100,
        newCustomers: 10,
        churnedCustomers: 5,
        mrr: 10000,
        newMrr: 1000,
        expansionMrr: 0,
        churnedMrr: 500,
        netNewMrr: 500,
      }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 10000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 15000 }),
      cogs: s({ "2026-01": 2000 }),
      operatingExpenses: s({ "2026-01": 13000 }),
      cashPosition: s({ "2026-01": 300000 }),
      netIncome: s({ "2026-01": -5000 }),
      headcount: s({ "2026-01": 10 }),
    };
    const m = computeAllMetrics(input);
    expect(Number.isNaN(m.cac[0]?.value)).toBe(true);
    expect(Number.isNaN(m.ltvCacRatio[0]?.value)).toBe(true);
  });
});

// ── EBITDA ────────────────────────────────────────────────────────────────────

describe("EBITDA — hand-calculated", () => {
  it("EBITDA = Operating Income + D&A", () => {
    // Revenue = 50000, COGS = 10000 → GP = 40000
    // OpEx = 25000 → Operating Income = 40000 - 25000 = 15000
    // D&A = 3000
    // EBITDA = 15000 + 3000 = 18000
    const input: MetricsInput = {
      revenue: s({ "2026-01": 50000 }),
      totalExpenses: s({ "2026-01": 35000 }),
      cogs: s({ "2026-01": 10000 }),
      operatingExpenses: s({ "2026-01": 25000 }),
      cashPosition: s({ "2026-01": 500000 }),
      netIncome: s({ "2026-01": 15000 }),
      headcount: s({ "2026-01": 20 }),
      depreciationAmortization: s({ "2026-01": 3000 }),
    };
    const m = computeAllMetrics(input);
    expect(m.ebitda[0]?.value).toBe(18000);
  });

  it("EBITDA equals Operating Income when no D&A provided", () => {
    const input: MetricsInput = {
      revenue: s({ "2026-01": 40000 }),
      totalExpenses: s({ "2026-01": 30000 }),
      cogs: s({ "2026-01": 8000 }),
      operatingExpenses: s({ "2026-01": 22000 }),
      cashPosition: s({ "2026-01": 300000 }),
      netIncome: s({ "2026-01": 10000 }),
      headcount: s({ "2026-01": 15 }),
    };
    const m = computeAllMetrics(input);
    // GP = 40000 - 8000 = 32000
    // OpInc = 32000 - 22000 = 10000
    // EBITDA = 10000 + 0 = 10000
    expect(m.operatingIncome[0]?.value).toBe(10000);
    expect(m.ebitda[0]?.value).toBe(10000);
  });
});

// ── Revenue Churn Rate ───────────────────────────────────────────────────────

describe("Revenue Churn Rate — hand-calculated", () => {
  it("Revenue Churn = churnedMRR / previous MRR × 100", () => {
    // Month 1 MRR = 16000 (beginning of period for month 2)
    // Month 2: churnedMrr = 800, prevMRR = 16000
    // Rate = 800 / 16000 × 100 = 5%
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        customers: 140,
        mrr: 16000,
        churnedMrr: 500,
        newMrr: 800,
        expansionMrr: 0,
        netNewMrr: 300,
      }),
      sub({
        month: "2026-02",
        customers: 150,
        mrr: 15200,
        churnedMrr: 800,
        newMrr: 1000,
        expansionMrr: 0,
        netNewMrr: 200,
      }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 16000, "2026-02": 15200 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 20000, "2026-02": 20000 }),
      cogs: s({ "2026-01": 3000, "2026-02": 3000 }),
      operatingExpenses: s({ "2026-01": 17000, "2026-02": 17000 }),
      cashPosition: s({ "2026-01": 400000, "2026-02": 395200 }),
      netIncome: s({ "2026-01": -4000, "2026-02": -4800 }),
      headcount: s({ "2026-01": 12, "2026-02": 12 }),
    };
    const m = computeAllMetrics(input);
    expect(m.revenueChurnRate[1]?.value).toBe(5);
  });
});

// ── MRR Growth Rate ──────────────────────────────────────────────────────────

describe("MRR Growth Rate — hand-calculated", () => {
  it("MRR Growth = (current - previous) / previous × 100", () => {
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 8000 }),
      sub({ month: "2026-02", mrr: 9200 }),
      sub({ month: "2026-03", mrr: 9200 }), // flat month
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 8000, "2026-02": 9200, "2026-03": 9200 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 12000, "2026-02": 12000, "2026-03": 12000 }),
      cogs: s({ "2026-01": 1600, "2026-02": 1840, "2026-03": 1840 }),
      operatingExpenses: s({ "2026-01": 10400, "2026-02": 10160, "2026-03": 10160 }),
      cashPosition: s({ "2026-01": 300000, "2026-02": 297200, "2026-03": 294400 }),
      netIncome: s({ "2026-01": -4000, "2026-02": -2800, "2026-03": -2800 }),
      headcount: s({ "2026-01": 8, "2026-02": 8, "2026-03": 8 }),
    };

    const m = computeAllMetrics(input);
    expect(m.mrrGrowthRate[0]?.value).toBe(0); // no prior
    // (9200 - 8000) / 8000 × 100 = 15%
    expect(m.mrrGrowthRate[1]?.value).toBe(15);
    // (9200 - 9200) / 9200 × 100 = 0%
    expect(m.mrrGrowthRate[2]?.value).toBe(0);
  });
});

// ── Customer Growth Rate ─────────────────────────────────────────────────────

describe("Customer Growth Rate — hand-calculated", () => {
  it("Customer Growth = (current - previous) / previous × 100", () => {
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", customers: 80 }),
      sub({ month: "2026-02", customers: 100 }),
    ];
    const input: MetricsInput = {
      revenue: s({ "2026-01": 8000, "2026-02": 10000 }),
      subscriptionDetails: details,
      totalExpenses: s({ "2026-01": 12000, "2026-02": 12000 }),
      cogs: s({ "2026-01": 1600, "2026-02": 2000 }),
      operatingExpenses: s({ "2026-01": 10400, "2026-02": 10000 }),
      cashPosition: s({ "2026-01": 300000, "2026-02": 298000 }),
      netIncome: s({ "2026-01": -4000, "2026-02": -2000 }),
      headcount: s({ "2026-01": 5, "2026-02": 5 }),
    };

    const m = computeAllMetrics(input);
    // (100 - 80) / 80 × 100 = 25%
    expect(m.customerGrowthRate[1]?.value).toBe(25);
  });
});

// ── Rule of 40 ───────────────────────────────────────────────────────────────

describe("Rule of 40 — hand-calculated", () => {
  it("Rule of 40 = Revenue Growth Rate + EBITDA Margin", () => {
    // Month 1: revenue=40000, month 2: revenue=50000
    // Growth = (50000-40000)/40000*100 = 25%
    // Month 2: GP = 50000-10000 = 40000, OpInc = 40000-25000 = 15000
    // EBITDA = OpInc + D&A = 15000 (no D&A)
    // EBITDA Margin = 15000/50000*100 = 30%
    // Rule of 40 = 25 + 30 = 55
    const input: MetricsInput = {
      revenue: s({ "2026-01": 40000, "2026-02": 50000 }),
      totalExpenses: s({ "2026-01": 30000, "2026-02": 35000 }),
      cogs: s({ "2026-01": 8000, "2026-02": 10000 }),
      operatingExpenses: s({ "2026-01": 22000, "2026-02": 25000 }),
      cashPosition: s({ "2026-01": 500000, "2026-02": 515000 }),
      netIncome: s({ "2026-01": 10000, "2026-02": 15000 }),
      headcount: s({ "2026-01": 20, "2026-02": 22 }),
    };
    const m = computeAllMetrics(input);
    expect(m.ruleOf40[1]?.value).toBe(55);
  });
});

// ── Custom Metrics (computeCustomMetrics) ────────────────────────────────────

describe("computeCustomMetrics", () => {
  it("computes a simple custom metric from built-in metrics", () => {
    const input: MetricsInput = {
      revenue: s({ "2026-01": 50000, "2026-02": 60000 }),
      totalExpenses: s({ "2026-01": 40000, "2026-02": 45000 }),
      cogs: s({ "2026-01": 10000, "2026-02": 12000 }),
      operatingExpenses: s({ "2026-01": 30000, "2026-02": 33000 }),
      cashPosition: s({ "2026-01": 500000, "2026-02": 510000 }),
      netIncome: s({ "2026-01": 10000, "2026-02": 15000 }),
      headcount: s({ "2026-01": 10, "2026-02": 12 }),
    };
    const builtIn = computeAllMetrics(input);
    const months = ["2026-01", "2026-02"];

    // Custom: "profitPerHead" = netIncome / headcount
    const customDefs: CustomMetricDefinition[] = [
      {
        id: "profitPerHead",
        name: "Profit per Head",
        dependsOn: ["netIncome", "revenuePerEmployee"],
        compute: (deps, ms) => {
          const ni = deps.get("netIncome")!;
          return ms.map((m, i) => ({
            month: m,
            value: ni[i]?.value ?? 0, // just surface the value
          }));
        },
      },
    ];

    const result = computeCustomMetrics(builtIn, customDefs, months);
    expect(result.get("profitPerHead")).toBeDefined();
    expect(result.get("profitPerHead")![0]?.value).toBe(10000);
    expect(result.get("profitPerHead")![1]?.value).toBe(15000);
  });

  it("resolves chained custom metrics in dependency order", () => {
    const input: MetricsInput = {
      revenue: s({ "2026-01": 100000 }),
      totalExpenses: s({ "2026-01": 60000 }),
      cogs: s({ "2026-01": 20000 }),
      operatingExpenses: s({ "2026-01": 40000 }),
      cashPosition: s({ "2026-01": 500000 }),
      netIncome: s({ "2026-01": 40000 }),
      headcount: s({ "2026-01": 20 }),
    };
    const builtIn = computeAllMetrics(input);
    const months = ["2026-01"];

    // metricA = grossProfit[0] * 2
    // metricB = metricA * 3
    const customDefs: CustomMetricDefinition[] = [
      {
        id: "metricB",
        name: "Metric B",
        dependsOn: ["metricA"],
        compute: (deps, ms) => {
          const a = deps.get("metricA")!;
          return ms.map((m, i) => ({ month: m, value: (a[i]?.value ?? 0) * 3 }));
        },
      },
      {
        id: "metricA",
        name: "Metric A",
        dependsOn: ["grossProfit"],
        compute: (deps, ms) => {
          const gp = deps.get("grossProfit")!;
          return ms.map((m, i) => ({ month: m, value: (gp[i]?.value ?? 0) * 2 }));
        },
      },
    ];

    const result = computeCustomMetrics(builtIn, customDefs, months);
    // GP = 100000 - 20000 = 80000
    // metricA = 80000 * 2 = 160000
    // metricB = 160000 * 3 = 480000
    expect(result.get("metricA")![0]?.value).toBe(160000);
    expect(result.get("metricB")![0]?.value).toBe(480000);
  });

  it("throws on circular custom metric dependencies", () => {
    const input: MetricsInput = {
      revenue: s({ "2026-01": 10000 }),
      totalExpenses: s({ "2026-01": 8000 }),
      cogs: s({ "2026-01": 2000 }),
      operatingExpenses: s({ "2026-01": 6000 }),
      cashPosition: s({ "2026-01": 100000 }),
      netIncome: s({ "2026-01": 2000 }),
      headcount: s({ "2026-01": 5 }),
    };
    const builtIn = computeAllMetrics(input);

    const customDefs: CustomMetricDefinition[] = [
      {
        id: "alpha",
        name: "Alpha",
        dependsOn: ["beta"],
        compute: (deps, ms) => ms.map((m) => ({ month: m, value: 0 })),
      },
      {
        id: "beta",
        name: "Beta",
        dependsOn: ["alpha"],
        compute: (deps, ms) => ms.map((m) => ({ month: m, value: 0 })),
      },
    ];

    expect(() => computeCustomMetrics(builtIn, customDefs, ["2026-01"])).toThrow(/[Cc]ircular/);
  });

  it("throws on unknown dependency", () => {
    const input: MetricsInput = {
      revenue: s({ "2026-01": 10000 }),
      totalExpenses: s({ "2026-01": 8000 }),
      cogs: s({ "2026-01": 2000 }),
      operatingExpenses: s({ "2026-01": 6000 }),
      cashPosition: s({ "2026-01": 100000 }),
      netIncome: s({ "2026-01": 2000 }),
      headcount: s({ "2026-01": 5 }),
    };
    const builtIn = computeAllMetrics(input);

    const customDefs: CustomMetricDefinition[] = [
      {
        id: "broken",
        name: "Broken",
        dependsOn: ["nonExistentMetric"],
        compute: (deps, ms) => ms.map((m) => ({ month: m, value: 0 })),
      },
    ];

    expect(() => computeCustomMetrics(builtIn, customDefs, ["2026-01"])).toThrow(/unknown metric/);
  });

  it("returns empty map when no custom definitions", () => {
    const input: MetricsInput = {
      revenue: s({ "2026-01": 10000 }),
      totalExpenses: s({ "2026-01": 8000 }),
      cogs: s({ "2026-01": 2000 }),
      operatingExpenses: s({ "2026-01": 6000 }),
      cashPosition: s({ "2026-01": 100000 }),
      netIncome: s({ "2026-01": 2000 }),
      headcount: s({ "2026-01": 5 }),
    };
    const builtIn = computeAllMetrics(input);
    const result = computeCustomMetrics(builtIn, [], ["2026-01"]);
    expect(result.size).toBe(0);
  });
});
