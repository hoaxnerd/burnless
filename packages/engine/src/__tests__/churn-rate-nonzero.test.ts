/**
 * Guard test [RPT-04] — customer/revenue churn rate must be strictly > 0 when
 * there ARE churned customers / churned MRR in the month.
 *
 * QA repro: 2 churned customers and $157 churned MRR are shown alongside a
 * "Customer Churn Rate" of 0.0%. The finding traces the false-zero to the
 * Metrics Explorer *display* path (formatPercent forces 1 fraction digit, so a
 * sub-0.05% rate renders '0.0%') — the engine value itself is small-but-nonzero.
 *
 * This engine-level test pins the contract that the underlying churn rate is
 * nonzero whenever churn happened. If the engine value is genuinely nonzero,
 * this passes (engine is correct) and the real gap is the web display rounding
 * — covered by the web lane. If the engine ever rounds it to 0, this is RED.
 */

import { describe, it, expect } from "vitest";
import { computeAllMetrics, type MetricsInput } from "../metrics";
import type { SubscriptionDetail } from "../revenue";
import type { MonthlySeries } from "../utils";

function makeSeries(values: Record<string, number>): MonthlySeries {
  return new Map(Object.entries(values));
}

describe("computeAllMetrics — churn rate is nonzero when churn occurred (RPT-04)", () => {
  const months = ["2026-01", "2026-02"];

  // Month 1: 1000 customers, $50,000 MRR (beginning-of-period for month 2).
  // Month 2: 2 customers churned, $157 MRR churned.
  const subscriptionDetails: SubscriptionDetail[] = [
    {
      month: "2026-01",
      customers: 1000,
      newCustomers: 0,
      churnedCustomers: 0,
      mrr: 50000,
      newMrr: 0,
      expansionMrr: 0,
      churnedMrr: 0,
      netNewMrr: 0,
    },
    {
      month: "2026-02",
      customers: 998,
      newCustomers: 0,
      churnedCustomers: 2,
      mrr: 49843,
      newMrr: 0,
      expansionMrr: 0,
      churnedMrr: 157,
      netNewMrr: -157,
    },
  ];

  const input: MetricsInput = {
    revenue: makeSeries({ "2026-01": 50000, "2026-02": 49843 }),
    subscriptionDetails,
    totalExpenses: makeSeries({ "2026-01": 30000, "2026-02": 30000 }),
    cogs: makeSeries({ "2026-01": 5000, "2026-02": 5000 }),
    operatingExpenses: makeSeries({ "2026-01": 25000, "2026-02": 25000 }),
    cashPosition: makeSeries({ "2026-01": 100000, "2026-02": 70000 }),
    netIncome: makeSeries({ "2026-01": 15000, "2026-02": 14843 }),
    headcount: makeSeries({ "2026-01": 10, "2026-02": 10 }),
  };

  it("customerChurnRate for the churn month is strictly > 0", () => {
    const m = computeAllMetrics(input);
    const idx = m.customerChurnRate.findIndex((v) => v.month === "2026-02");
    const value = m.customerChurnRate[idx]?.value ?? 0;
    expect(
      value,
      `customerChurnRate['2026-02'] === ${value} (2 churned of 1000 beginning). ` +
        `Must be > 0, not a rounded-to-zero churn.`
    ).toBeGreaterThan(0);
  });

  it("revenueChurnRate for the churn month is strictly > 0", () => {
    const m = computeAllMetrics(input);
    const idx = m.revenueChurnRate.findIndex((v) => v.month === "2026-02");
    const value = m.revenueChurnRate[idx]?.value ?? 0;
    expect(
      value,
      `revenueChurnRate['2026-02'] === ${value} ($157 churned of $50,000 beginning MRR). ` +
        `Must be > 0, not a rounded-to-zero churn.`
    ).toBeGreaterThan(0);
  });
});
