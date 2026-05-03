import { describe, expect, it } from "vitest";
import { computeRevenueStream } from "../revenue";

describe("ecommerce revenue", () => {
  it("computes orders × AOV with no growth", () => {
    const series = computeRevenueStream(
      {
        id: "e1",
        name: "Ecommerce",
        type: "ecommerce",
        parameters: { ordersPerMonth: 500, averageOrderValue: 80, orderGrowthRate: 0, aovGrowthRate: 0 },
        startDate: new Date("2026-01-01"),
        endDate: null,
      },
      new Date("2026-01-01"),
      new Date("2026-03-01"),
    );
    expect(series.get("2026-01")).toBeCloseTo(40000, 2);
    expect(series.get("2026-02")).toBeCloseTo(40000, 2);
  });

  it("compounds both order-growth and AOV-growth across months", () => {
    const series = computeRevenueStream(
      {
        id: "e2",
        name: "Ecommerce",
        type: "ecommerce",
        parameters: { ordersPerMonth: 100, averageOrderValue: 50, orderGrowthRate: 0.10, aovGrowthRate: 0.05 },
        startDate: new Date("2026-01-01"),
        endDate: null,
      },
      new Date("2026-01-01"),
      new Date("2026-04-01"),
    );
    // Month 0: 100 × 50 = 5000
    expect(series.get("2026-01")).toBeCloseTo(5000, 2);
    // Month 1: 100×1.10 × 50×1.05 = 110 × 52.5 = 5775
    expect(series.get("2026-02")).toBeCloseTo(5775, 2);
    // Month 2: 100×1.10^2 × 50×1.05^2 = 121 × 55.125 = 6670.125
    expect(series.get("2026-03")).toBeCloseTo(6670.13, 1);
  });
});
