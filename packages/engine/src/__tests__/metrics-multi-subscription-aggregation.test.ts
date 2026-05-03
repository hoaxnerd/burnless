import { describe, it, expect } from "vitest";
import { computeAllMetrics, type MetricsInput } from "../metrics";
import type { SubscriptionDetail } from "../revenue";

describe("metrics — multi-stream subscription detail aggregation", () => {
  function makeInput(details: SubscriptionDetail[]): MetricsInput {
    return {
      revenue: new Map([["2026-01", 0]]),
      subscriptionDetails: details,
      totalExpenses: new Map([["2026-01", 0]]),
      cogs: new Map(),
      operatingExpenses: new Map(),
      cashPosition: new Map([["2026-01", 0]]),
      netIncome: new Map([["2026-01", 0]]),
      headcount: new Map([["2026-01", 0]]),
    };
  }

  it("sums MRR across multiple subscription streams in the same month", () => {
    const a: SubscriptionDetail = {
      month: "2026-01",
      customers: 100,
      newCustomers: 5,
      churnedCustomers: 1,
      mrr: 5000,
      newMrr: 250,
      expansionMrr: 0,
      churnedMrr: 50,
      netNewMrr: 200,
    };
    const b: SubscriptionDetail = {
      month: "2026-01",
      customers: 4,
      newCustomers: 0,
      churnedCustomers: 0,
      mrr: 10000,
      newMrr: 0,
      expansionMrr: 0,
      churnedMrr: 0,
      netNewMrr: 0,
    };

    const metrics = computeAllMetrics(makeInput([a, b]));

    expect(metrics.mrr[0]?.value).toBe(15000);
    expect(metrics.totalCustomers[0]?.value).toBe(104);
    expect(metrics.newCustomersPerMonth[0]?.value).toBe(5);
    expect(metrics.churnedCustomersPerMonth[0]?.value).toBe(1);
    expect(metrics.newMrr[0]?.value).toBe(250);
    expect(metrics.churnedMrr[0]?.value).toBe(50);
    expect(metrics.netNewMrr[0]?.value).toBe(200);
  });

  it("keeps optional fields undefined when no stream provides them", () => {
    const a: SubscriptionDetail = {
      month: "2026-01",
      customers: 10,
      newCustomers: 0,
      churnedCustomers: 0,
      mrr: 1000,
      newMrr: 0,
      expansionMrr: 0,
      churnedMrr: 0,
      netNewMrr: 0,
    };
    const b: SubscriptionDetail = { ...a, mrr: 2000 };

    const metrics = computeAllMetrics(makeInput([a, b]));

    expect(metrics.mrr[0]?.value).toBe(3000);
    // contractionMrr / reactivationMrr should remain absent (no stream sets them)
    expect(metrics.contractionMrr[0]?.value).toBe(0);
    expect(metrics.reactivationMrr[0]?.value).toBe(0);
  });
});
