import { describe, expect, it } from "vitest";
import { computeSubscriptionDetail } from "../revenue";

describe("subscription expansion", () => {
  it("compounds expansionRate into MRR", () => {
    const detail = computeSubscriptionDetail(
      {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 0,
        monthlyChurnRate: 0,
        expansionRate: 0.02,
      },
      new Date("2026-01-01"),
      new Date("2026-04-01"),
    );
    // Jan: 100 × 50 × (1 + 0.02) = 5100
    expect(detail[0]!.mrr).toBeCloseTo(5100, 2);
    expect(detail[0]!.expansionMrr).toBeCloseTo(100, 2);
    // Feb: prior ARPA carries expansion; with no churn / new, growth compounds
    expect(detail[1]!.mrr).toBeGreaterThan(5100);
  });

  it("zero expansionRate matches no-expansion flow", () => {
    const detail = computeSubscriptionDetail(
      {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 0,
        monthlyChurnRate: 0,
      },
      new Date("2026-01-01"),
      new Date("2026-02-01"),
    );
    expect(detail[0]!.mrr).toBeCloseTo(5000, 2);
    expect(detail[0]!.expansionMrr).toBeCloseTo(0, 2);
  });
});
