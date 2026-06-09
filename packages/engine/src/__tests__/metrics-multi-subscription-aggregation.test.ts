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
    // Stream a carries contraction + reactivation; stream b carries expansion +
    // reactivation. Aggregated components: new 250, expansion 20, reactivation 30,
    // churned 50, contraction 30. netNewMrr is RE-DERIVED from the summed
    // components (Phase 6 §6.1): 250 + 20 + 30 − 50 − 30 = 220 — NOT the sum of
    // the (now-poisoned) per-stream netNewMrr fields (190 + 9999).
    const a: SubscriptionDetail = {
      month: "2026-01",
      customers: 100,
      newCustomers: 5,
      churnedCustomers: 1,
      mrr: 5000,
      newMrr: 250,
      expansionMrr: 0,
      churnedMrr: 50,
      contractionMrr: 30,
      reactivationMrr: 20,
      netNewMrr: 190, // 250 + 0 + 20 − 50 − 30
    };
    const b: SubscriptionDetail = {
      month: "2026-01",
      customers: 4,
      newCustomers: 0,
      churnedCustomers: 0,
      mrr: 10000,
      newMrr: 0,
      expansionMrr: 20,
      churnedMrr: 0,
      reactivationMrr: 10,
      netNewMrr: 9999, // poisoned — must be ignored, engine re-derives
    };

    const metrics = computeAllMetrics(makeInput([a, b]));

    expect(metrics.mrr[0]?.value).toBe(15000);
    expect(metrics.totalCustomers[0]?.value).toBe(104);
    expect(metrics.newCustomersPerMonth[0]?.value).toBe(5);
    expect(metrics.churnedCustomersPerMonth[0]?.value).toBe(1);
    expect(metrics.newMrr[0]?.value).toBe(250);
    expect(metrics.churnedMrr[0]?.value).toBe(50);
    expect(metrics.netNewMrr[0]?.value).toBe(220);
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
