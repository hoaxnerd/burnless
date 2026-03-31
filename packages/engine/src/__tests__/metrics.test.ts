import { describe, it, expect } from "vitest";
import { computeAllMetrics, type MetricsInput } from "../metrics";
import type { SubscriptionDetail } from "../revenue";
import type { MonthlySeries } from "../utils";

function makeSeries(values: Record<string, number>): MonthlySeries {
  return new Map(Object.entries(values));
}

describe("metrics", () => {
  it("computes core SaaS metrics from subscription details", () => {
    const subDetails: SubscriptionDetail[] = [
      { month: "2026-01", customers: 100, newCustomers: 10, churnedCustomers: 5, mrr: 10000, newMrr: 1000, expansionMrr: 200, churnedMrr: 500, netNewMrr: 700 },
      { month: "2026-02", customers: 105, newCustomers: 10, churnedCustomers: 5, mrr: 10700, newMrr: 1000, expansionMrr: 214, churnedMrr: 500, netNewMrr: 714 },
    ];

    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 10000, "2026-02": 10700 }),
      subscriptionDetails: subDetails,
      totalExpenses: makeSeries({ "2026-01": 15000, "2026-02": 15000 }),
      cogs: makeSeries({ "2026-01": 2000, "2026-02": 2000 }),
      operatingExpenses: makeSeries({ "2026-01": 13000, "2026-02": 13000 }),
      cashPosition: makeSeries({ "2026-01": 500000, "2026-02": 495700 }),
      netIncome: makeSeries({ "2026-01": -5000, "2026-02": -4300 }),
      headcount: makeSeries({ "2026-01": 10, "2026-02": 10 }),
    };

    const m = computeAllMetrics(input);

    // MRR
    expect(m.mrr[0]?.value).toBe(10000);
    expect(m.mrr[1]?.value).toBe(10700);

    // ARR = MRR * 12
    expect(m.arr[0]?.value).toBe(120000);

    // Customers
    expect(m.totalCustomers[0]?.value).toBe(100);

    // ARPA = MRR / customers
    expect(m.arpa[0]?.value).toBe(100); // 10000/100

    // Churn rate (month 2: uses beginning-of-period = prev month's ending = 100)
    // 5 / 100 * 100 = 5%
    expect(m.customerChurnRate[1]?.value).toBe(5);

    // Net burn rate
    expect(m.netBurnRate[0]?.value).toBe(5000); // expenses - revenue

    // Runway
    expect(m.cashRunwayMonths[0]?.value).toBe(100); // 500000/5000

    // Gross profit
    expect(m.grossProfit[0]?.value).toBe(8000); // 10000 - 2000

    // Gross margin
    expect(m.grossMarginPercent[0]?.value).toBe(80); // 8000/10000 * 100

    // Revenue per employee (annualized)
    expect(m.revenuePerEmployee[0]?.value).toBe(12000); // 10000 * 12 / 10

    // SaaS Quick Ratio
    expect(m.saasQuickRatio[0]?.value).toBe(2.4); // (1000 + 200) / 500
  });

  it("handles zero-division cases gracefully", () => {
    const input: MetricsInput = {
      revenue: makeSeries({ "2026-01": 0 }),
      totalExpenses: makeSeries({ "2026-01": 0 }),
      cogs: makeSeries({ "2026-01": 0 }),
      operatingExpenses: makeSeries({ "2026-01": 0 }),
      cashPosition: makeSeries({ "2026-01": 0 }),
      netIncome: makeSeries({ "2026-01": 0 }),
      headcount: makeSeries({ "2026-01": 0 }),
    };

    const m = computeAllMetrics(input);
    expect(m.grossMarginPercent[0]?.value).toBe(0);
    expect(m.revenuePerEmployee[0]?.value).toBe(0);
    expect(m.cashRunwayMonths[0]?.value).toBe(999); // not burning
  });
});
