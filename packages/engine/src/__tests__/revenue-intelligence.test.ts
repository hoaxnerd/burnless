/**
 * Revenue Intelligence test suite — BUR-68
 *
 * Validates the revenue metrics that power the Revenue Intelligence page:
 * - MRR waterfall algebraic identity (new + expansion - churn = netNew)
 * - Multi-month compound growth accuracy (12-month horizon)
 * - Combined subscription parameters (churn + expansion + price growth + new customers)
 * - Reactivation MRR flow through metrics
 * - Multi-stream total precision (individual streams sum to total)
 * - Revenue growth trajectory consistency
 */

import { describe, it, expect } from "vitest";
import {
  computeRevenueStream,
  computeTotalRevenue,
  computeSubscriptionDetail,
  type RevenueStreamInput,
  type SubscriptionParams,
  type SubscriptionDetail,
} from "../revenue";
import { computeAllMetrics, type MetricsInput } from "../metrics";
import type { MonthlySeries } from "../utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSeries(values: Record<string, number>): MonthlySeries {
  return new Map(Object.entries(values));
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

// ── MRR Waterfall Algebraic Identity ─────────────────────────────────────────

describe("MRR Waterfall — algebraic identity", () => {
  it("netNewMrr = newMrr + expansionMrr - churnedMrr for every month", () => {
    const params: SubscriptionParams = {
      startingCustomers: 200,
      monthlyPrice: 75,
      newCustomersPerMonth: 15,
      monthlyChurnRate: 0.04,
      expansionRate: 0.03,
    };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 1);
    const details = computeSubscriptionDetail(params, start, end);

    expect(details).toHaveLength(12);
    for (const d of details) {
      const expected = d.newMrr + d.expansionMrr - d.churnedMrr;
      // Each component is dRound2'd independently, so sum may differ by ≤$0.02
      expect(Math.abs(d.netNewMrr - expected)).toBeLessThanOrEqual(0.02);
    }
  });

  it("MRR increases when netNewMrr > 0 every month", () => {
    const params: SubscriptionParams = {
      startingCustomers: 100,
      monthlyPrice: 100,
      newCustomersPerMonth: 20,
      monthlyChurnRate: 0.02, // low churn, high new → always growing
      expansionRate: 0.05,
    };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 1);
    const details = computeSubscriptionDetail(params, start, end);

    for (let i = 0; i < details.length; i++) {
      expect(details[i]!.netNewMrr).toBeGreaterThan(0);
      if (i > 0) {
        expect(details[i]!.mrr).toBeGreaterThan(details[i - 1]!.mrr);
      }
    }
  });

  it("MRR decreases when churn dominates (death spiral)", () => {
    const params: SubscriptionParams = {
      startingCustomers: 100,
      monthlyPrice: 100,
      newCustomersPerMonth: 1,
      monthlyChurnRate: 0.15, // 15% churn, only 1 new → shrinking
    };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 1);
    const details = computeSubscriptionDetail(params, start, end);

    // MRR should strictly decline
    for (let i = 1; i < details.length; i++) {
      expect(details[i]!.mrr).toBeLessThan(details[i - 1]!.mrr);
    }

    // Should lose significant customers by month 12
    expect(details[11]!.customers).toBeLessThan(50);
  });
});

// ── Combined Subscription Parameters ─────────────────────────────────────────

describe("Subscription — all parameters combined", () => {
  it("handles churn + expansion + price growth + new customers simultaneously", () => {
    const params: SubscriptionParams = {
      startingCustomers: 100,
      monthlyPrice: 50,
      newCustomersPerMonth: 10,
      monthlyChurnRate: 0.05,
      expansionRate: 0.03,
      priceGrowthRate: 0.01, // 1% monthly price increase
    };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 5, 1);
    const details = computeSubscriptionDetail(params, start, end);

    // Month 1: churn 5, retain 95, new 10 → 105 customers
    expect(details[0]!.customers).toBe(105);
    expect(details[0]!.churnedCustomers).toBe(5);
    expect(details[0]!.newCustomers).toBe(10);

    // Month 1 MRR: retained(95)*50 + expansion(95*50*0.03) + new(10*50)
    // = 4750 + 142.5 + 500 = 5392.50
    expect(details[0]!.mrr).toBeCloseTo(5392.5, 1);

    // Price should compound: month 2 price = 50 * 1.01 = 50.50
    // Customers month 2: 105 - churn(105*0.05=5.25) + 10 = 109.75
    expect(details[1]!.customers).toBeCloseTo(109.75, 1);

    // MRR should grow due to expansion + price growth + customer growth
    for (let i = 1; i < details.length; i++) {
      expect(details[i]!.mrr).toBeGreaterThan(details[i - 1]!.mrr);
    }
  });
});

// ── 12-Month Compound Growth Accuracy ────────────────────────────────────────

describe("12-month compound growth — precision", () => {
  it("subscription revenue compounds correctly over 12 months", () => {
    const params: SubscriptionParams = {
      startingCustomers: 1000,
      monthlyPrice: 99,
      newCustomersPerMonth: 50,
      monthlyChurnRate: 0.03,
      expansionRate: 0.02,
      priceGrowthRate: 0.005,
    };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 1);
    const details = computeSubscriptionDetail(params, start, end);

    expect(details).toHaveLength(12);

    // All values should be positive and finite
    for (const d of details) {
      expect(d.mrr).toBeGreaterThan(0);
      expect(d.customers).toBeGreaterThan(0);
      expect(Number.isFinite(d.mrr)).toBe(true);
      expect(Number.isFinite(d.customers)).toBe(true);
    }

    // MRR at month 12 should be materially higher than month 1
    // New customers outpace churn, plus expansion and price growth
    expect(details[11]!.mrr).toBeGreaterThan(details[0]!.mrr * 1.2);

    // Customer count should grow
    expect(details[11]!.customers).toBeGreaterThan(details[0]!.customers);
  });

  it("usage-based revenue compounds user and usage growth independently", () => {
    const stream: RevenueStreamInput = {
      id: "usage-1",
      name: "API Usage",
      type: "usage_based",
      parameters: {
        activeUsers: 100,
        avgUsagePerUser: 1000,
        pricePerUnit: 0.001,
        userGrowthRate: 0.05,    // 5% monthly user growth
        usageGrowthRate: 0.02,   // 2% monthly usage growth per user
      },
    };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 1);
    const result = computeRevenueStream(stream, start, end);

    // Month 1: 100 * 1000 * 0.001 = 100
    expect(result.get("2026-01")).toBe(100);

    // Month 12 should reflect compound of both growths
    // Users: 100 * (1.05)^11, Usage: 1000 * (1.02)^11
    const expectedUsers = 100 * Math.pow(1.05, 11);
    const expectedUsage = 1000 * Math.pow(1.02, 11);
    const expectedRevenue = expectedUsers * expectedUsage * 0.001;
    expect(result.get("2026-12")).toBeCloseTo(expectedRevenue, 0);
  });

  it("one-time revenue with unit growth compounds correctly", () => {
    const stream: RevenueStreamInput = {
      id: "product-1",
      name: "Product Sales",
      type: "one_time",
      parameters: { unitsPerMonth: 100, pricePerUnit: 50, unitGrowthRate: 0.10 },
    };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 1);
    const result = computeRevenueStream(stream, start, end);

    // Month 1: 100 * 50 = 5000
    expect(result.get("2026-01")).toBe(5000);

    // Month 12: units = 100 * (1.10)^11, revenue = units * 50
    const expectedUnits = 100 * Math.pow(1.10, 11);
    expect(result.get("2026-12")).toBeCloseTo(expectedUnits * 50, 0);
  });
});

// ── Multi-Stream Total Precision ─────────────────────────────────────────────

describe("Multi-stream total — precision", () => {
  it("individual stream revenues sum to computeTotalRevenue", () => {
    const streams: RevenueStreamInput[] = [
      {
        id: "s1",
        name: "SaaS",
        type: "subscription",
        parameters: {
          startingCustomers: 50,
          monthlyPrice: 200,
          newCustomersPerMonth: 5,
          monthlyChurnRate: 0.03,
          expansionRate: 0.02,
        },
      },
      {
        id: "s2",
        name: "API Usage",
        type: "usage_based",
        parameters: { activeUsers: 500, avgUsagePerUser: 100, pricePerUnit: 0.05 },
      },
      {
        id: "s3",
        name: "Consulting",
        type: "services",
        parameters: { hoursPerMonth: 80, hourlyRate: 150, hoursGrowthRate: 0.05 },
      },
      {
        id: "s4",
        name: "Setup Fees",
        type: "one_time",
        parameters: { unitsPerMonth: 5, pricePerUnit: 1000, unitGrowthRate: 0.08 },
      },
    ];

    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 1);

    const total = computeTotalRevenue(streams, start, end);
    const individual = streams.map((s) => computeRevenueStream(s, start, end));

    // Every month: sum of individual streams should equal total
    for (const [month, totalValue] of total) {
      let sum = 0;
      for (const series of individual) {
        sum += series.get(month) ?? 0;
      }
      expect(totalValue).toBeCloseTo(sum, 2);
    }

    // Total should span all 12 months
    expect(total.size).toBe(12);
  });

  it("empty streams produce empty total", () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 5, 1);
    const total = computeTotalRevenue([], start, end);
    expect(total.size).toBe(0);
  });

  it("single stream total equals stream revenue", () => {
    const stream: RevenueStreamInput = {
      id: "solo",
      name: "Only Revenue",
      type: "services",
      parameters: { hoursPerMonth: 100, hourlyRate: 200 },
    };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 5, 1);

    const total = computeTotalRevenue([stream], start, end);
    const single = computeRevenueStream(stream, start, end);

    for (const [month, value] of total) {
      expect(value).toBe(single.get(month));
    }
  });
});

// ── ReactivationMrr Flow Through Metrics ─────────────────────────────────────

describe("ReactivationMrr — flow through metrics", () => {
  it("passes reactivationMrr from subscription details to metrics output", () => {
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        customers: 100,
        mrr: 10000,
        newMrr: 500,
        expansionMrr: 200,
        churnedMrr: 300,
        reactivationMrr: 150,
        netNewMrr: 550, // 500 + 200 + 150 - 300
      }),
      sub({
        month: "2026-02",
        customers: 105,
        mrr: 10550,
        newMrr: 600,
        expansionMrr: 250,
        churnedMrr: 350,
        reactivationMrr: 200,
        netNewMrr: 700,
      }),
    ];

    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 10000, "2026-02": 10550 }),
      subscriptionDetails: details,
      totalExpenses: makeSeries({ "2026-01": 15000, "2026-02": 15000 }),
      cogs: makeSeries({ "2026-01": 2000, "2026-02": 2000 }),
      operatingExpenses: makeSeries({ "2026-01": 13000, "2026-02": 13000 }),
      cashPosition: makeSeries({ "2026-01": 500000, "2026-02": 495550 }),
      netIncome: makeSeries({ "2026-01": -5000, "2026-02": -4450 }),
      headcount: makeSeries({ "2026-01": 10, "2026-02": 10 }),
    };

    const m = computeAllMetrics(input);

    // reactivationMrr should be surfaced in metrics
    expect(m.reactivationMrr[0]?.value).toBe(150);
    expect(m.reactivationMrr[1]?.value).toBe(200);
  });

  it("defaults reactivationMrr to 0 when not provided", () => {
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        customers: 100,
        mrr: 10000,
        newMrr: 500,
        churnedMrr: 300,
        netNewMrr: 200,
      }),
    ];

    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 10000 }),
      subscriptionDetails: details,
      totalExpenses: makeSeries({ "2026-01": 12000 }),
      cogs: makeSeries({ "2026-01": 2000 }),
      operatingExpenses: makeSeries({ "2026-01": 10000 }),
      cashPosition: makeSeries({ "2026-01": 300000 }),
      netIncome: makeSeries({ "2026-01": -2000 }),
      headcount: makeSeries({ "2026-01": 5 }),
    };

    const m = computeAllMetrics(input);
    expect(m.reactivationMrr[0]?.value).toBe(0);
  });
});

// ── Revenue Growth Metrics (MoM) ─────────────────────────────────────────────

describe("Revenue growth trajectory — MoM consistency", () => {
  it("revenue growth rate tracks MoM percentage change correctly", () => {
    const input: MetricsInput = {
      revenue: makeSeries({
        "2026-01": 10000,
        "2026-02": 11000,  // +10%
        "2026-03": 12100,  // +10%
        "2026-04": 13310,  // +10%
      }),
      totalExpenses: makeSeries({ "2026-01": 8000, "2026-02": 8000, "2026-03": 8000, "2026-04": 8000 }),
      cogs: makeSeries({ "2026-01": 2000, "2026-02": 2200, "2026-03": 2420, "2026-04": 2662 }),
      operatingExpenses: makeSeries({ "2026-01": 6000, "2026-02": 5800, "2026-03": 5580, "2026-04": 5338 }),
      cashPosition: makeSeries({ "2026-01": 500000, "2026-02": 503000, "2026-03": 507100, "2026-04": 512410 }),
      netIncome: makeSeries({ "2026-01": 2000, "2026-02": 3000, "2026-03": 4100, "2026-04": 5310 }),
      headcount: makeSeries({ "2026-01": 10, "2026-02": 10, "2026-03": 10, "2026-04": 10 }),
    };

    const m = computeAllMetrics(input);

    expect(m.revenueGrowthRate[0]?.value).toBe(0); // no prior
    expect(m.revenueGrowthRate[1]?.value).toBe(10); // (11000-10000)/10000*100
    expect(m.revenueGrowthRate[2]?.value).toBe(10);
    expect(m.revenueGrowthRate[3]?.value).toBe(10);
  });

  it("MRR growth rate differs from revenue growth when subscription details provided", () => {
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 8000, customers: 80 }),
      sub({ month: "2026-02", mrr: 9600, customers: 96 }), // MRR +20%
      sub({ month: "2026-03", mrr: 10560, customers: 105 }), // MRR +10%
    ];

    const input: MetricsInput = {
      revenue: makeSeries({
        "2026-01": 12000,  // includes non-SaaS
        "2026-02": 14000,  // +16.67%
        "2026-03": 15560,  // +11.14%
      }),
      subscriptionDetails: details,
      totalExpenses: makeSeries({ "2026-01": 10000, "2026-02": 10000, "2026-03": 10000 }),
      cogs: makeSeries({ "2026-01": 2000, "2026-02": 2000, "2026-03": 2000 }),
      operatingExpenses: makeSeries({ "2026-01": 8000, "2026-02": 8000, "2026-03": 8000 }),
      cashPosition: makeSeries({ "2026-01": 400000, "2026-02": 404000, "2026-03": 409560 }),
      netIncome: makeSeries({ "2026-01": 2000, "2026-02": 4000, "2026-03": 5560 }),
      headcount: makeSeries({ "2026-01": 8, "2026-02": 8, "2026-03": 8 }),
    };

    const m = computeAllMetrics(input);

    // MRR growth rate should use subscription details
    expect(m.mrrGrowthRate[1]?.value).toBe(20); // 9600/8000 - 1 = 20%
    expect(m.mrrGrowthRate[2]?.value).toBe(10); // 10560/9600 - 1 = 10%

    // Revenue growth uses total revenue
    expect(m.revenueGrowthRate[1]?.value).toBeCloseTo(16.67, 1);
    expect(m.revenueGrowthRate[2]?.value).toBeCloseTo(11.14, 1);
  });
});

// ── ARR Accuracy ─────────────────────────────────────────────────────────────

describe("ARR = MRR × 12 — consistency", () => {
  it("ARR is exactly 12x MRR for every month", () => {
    const details: SubscriptionDetail[] = [
      sub({ month: "2026-01", mrr: 8333, customers: 100 }),
      sub({ month: "2026-02", mrr: 9167, customers: 110 }),
      sub({ month: "2026-03", mrr: 10417, customers: 125 }),
    ];

    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 8333, "2026-02": 9167, "2026-03": 10417 }),
      subscriptionDetails: details,
      totalExpenses: makeSeries({ "2026-01": 6000, "2026-02": 6000, "2026-03": 6000 }),
      cogs: makeSeries({ "2026-01": 1000, "2026-02": 1000, "2026-03": 1000 }),
      operatingExpenses: makeSeries({ "2026-01": 5000, "2026-02": 5000, "2026-03": 5000 }),
      cashPosition: makeSeries({ "2026-01": 200000, "2026-02": 203333, "2026-03": 207500 }),
      netIncome: makeSeries({ "2026-01": 2333, "2026-02": 3167, "2026-03": 4417 }),
      headcount: makeSeries({ "2026-01": 5, "2026-02": 5, "2026-03": 5 }),
    };

    const m = computeAllMetrics(input);

    for (let i = 0; i < 3; i++) {
      expect(m.arr[i]?.value).toBe(m.mrr[i]!.value * 12);
    }
  });
});

// ── SaaS Quick Ratio with Full Waterfall Components ──────────────────────────

describe("SaaS Quick Ratio — full waterfall", () => {
  it("includes contractionMrr in denominator", () => {
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        customers: 100,
        mrr: 10000,
        newMrr: 800,
        expansionMrr: 400,
        churnedMrr: 300,
        contractionMrr: 200,
        netNewMrr: 700,
      }),
    ];

    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 10000 }),
      subscriptionDetails: details,
      totalExpenses: makeSeries({ "2026-01": 12000 }),
      cogs: makeSeries({ "2026-01": 2000 }),
      operatingExpenses: makeSeries({ "2026-01": 10000 }),
      cashPosition: makeSeries({ "2026-01": 300000 }),
      netIncome: makeSeries({ "2026-01": -2000 }),
      headcount: makeSeries({ "2026-01": 5 }),
    };

    const m = computeAllMetrics(input);
    // Quick Ratio = (800 + 400) / (300 + 200) = 1200 / 500 = 2.4
    expect(m.saasQuickRatio[0]?.value).toBe(2.4);
  });

  it("healthy Quick Ratio > 4 indicates strong growth", () => {
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        customers: 200,
        mrr: 20000,
        newMrr: 3000,
        expansionMrr: 1500,
        churnedMrr: 500,
        contractionMrr: 100,
        netNewMrr: 3900,
      }),
    ];

    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 20000 }),
      subscriptionDetails: details,
      totalExpenses: makeSeries({ "2026-01": 18000 }),
      cogs: makeSeries({ "2026-01": 4000 }),
      operatingExpenses: makeSeries({ "2026-01": 14000 }),
      cashPosition: makeSeries({ "2026-01": 500000 }),
      netIncome: makeSeries({ "2026-01": 2000 }),
      headcount: makeSeries({ "2026-01": 15 }),
    };

    const m = computeAllMetrics(input);
    // (3000 + 1500) / (500 + 100) = 4500 / 600 = 7.5
    expect(m.saasQuickRatio[0]?.value).toBe(7.5);
    expect(m.saasQuickRatio[0]!.value).toBeGreaterThan(4);
  });
});

// ── Revenue Intelligence Dashboard Metrics ───────────────────────────────────

describe("Revenue intelligence — dashboard metrics completeness", () => {
  it("computeAllMetrics returns all revenue-related metrics for a realistic scenario", () => {
    const details: SubscriptionDetail[] = [
      sub({
        month: "2026-01",
        customers: 150,
        newCustomers: 20,
        churnedCustomers: 8,
        mrr: 15000,
        newMrr: 2000,
        expansionMrr: 500,
        churnedMrr: 800,
        contractionMrr: 100,
        downgradeMrr: 100,
        reactivationMrr: 50,
        netNewMrr: 1650,
        activeUsers: 400,
      }),
      sub({
        month: "2026-02",
        customers: 162,
        newCustomers: 22,
        churnedCustomers: 10,
        mrr: 16650,
        newMrr: 2200,
        expansionMrr: 600,
        churnedMrr: 900,
        contractionMrr: 150,
        downgradeMrr: 150,
        reactivationMrr: 100,
        netNewMrr: 1850,
        activeUsers: 440,
      }),
      sub({
        month: "2026-03",
        customers: 174,
        newCustomers: 25,
        churnedCustomers: 13,
        mrr: 18500,
        newMrr: 2500,
        expansionMrr: 700,
        churnedMrr: 1000,
        contractionMrr: 200,
        downgradeMrr: 200,
        reactivationMrr: 150,
        netNewMrr: 2150,
        activeUsers: 480,
      }),
    ];

    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 15000, "2026-02": 16650, "2026-03": 18500 }),
      subscriptionDetails: details,
      totalExpenses: makeSeries({ "2026-01": 20000, "2026-02": 21000, "2026-03": 22000 }),
      cogs: makeSeries({ "2026-01": 3000, "2026-02": 3300, "2026-03": 3700 }),
      operatingExpenses: makeSeries({ "2026-01": 17000, "2026-02": 17700, "2026-03": 18300 }),
      cashPosition: makeSeries({ "2026-01": 500000, "2026-02": 495650, "2026-03": 492150 }),
      netIncome: makeSeries({ "2026-01": -5000, "2026-02": -4350, "2026-03": -3500 }),
      headcount: makeSeries({ "2026-01": 12, "2026-02": 13, "2026-03": 14 }),
      acquisitionSpend: makeSeries({ "2026-01": 4000, "2026-02": 4500, "2026-03": 5000 }),
    };

    const m = computeAllMetrics(input);

    // ── MRR / ARR ──
    expect(m.mrr[0]?.value).toBe(15000);
    expect(m.arr[0]?.value).toBe(180000);

    // ── Waterfall components ──
    expect(m.newMrr[0]?.value).toBe(2000);
    expect(m.expansionMrr[0]?.value).toBe(500);
    expect(m.churnedMrr[0]?.value).toBe(800);
    expect(m.contractionMrr[0]?.value).toBe(100);
    expect(m.downgradeMrr[0]?.value).toBe(100);
    expect(m.reactivationMrr[0]?.value).toBe(50);
    expect(m.netNewMrr[0]?.value).toBe(1650);

    // ── Customer metrics ──
    expect(m.totalCustomers[0]?.value).toBe(150);
    expect(m.newCustomersPerMonth[0]?.value).toBe(20);
    expect(m.churnedCustomersPerMonth[0]?.value).toBe(8);

    // ── Growth rates ──
    expect(m.mrrGrowthRate[1]?.value).toBe(11); // (16650-15000)/15000*100 = 11%
    expect(m.revenueGrowthRate[1]?.value).toBe(11);

    // ── SaaS metrics ──
    expect(m.arpa[0]?.value).toBe(100); // 15000/150
    expect(m.arpu[0]?.value).toBeCloseTo(37.5, 1); // 15000/400
    expect(m.saasQuickRatio[0]?.value).toBeCloseTo(2.78, 1); // (2000+500)/(800+100)

    // ── LTV & CAC ──
    expect(m.cac[0]?.value).toBe(200); // 4000/20
    expect(m.ltv[0]?.value).toBeGreaterThan(0);
    expect(m.ltvCacRatio[0]?.value).toBeGreaterThan(0);

    // ── Retention ──
    expect(m.netRevenueRetention[1]?.value).toBeCloseTo(96.33, 0); // (16650-2200)/15000*100
    expect(m.grossRevenueRetention[1]?.value).toBe(93); // 1-(900+150)/15000*100

    // ── Cash ──
    expect(m.netBurnRate[0]?.value).toBe(5000);
    expect(m.cashRunwayMonths[0]?.value).toBe(100); // 500000/5000

    // ── Profitability ──
    expect(m.grossProfit[0]?.value).toBe(12000); // 15000-3000
    expect(m.grossMarginPercent[0]?.value).toBe(80);
  });
});
