import { describe, expect, it } from "vitest";
import { computeRevenueStream } from "../revenue";

describe("hardware revenue", () => {
  it("computes units × price with no growth", () => {
    const series = computeRevenueStream(
      {
        id: "h1",
        name: "Hardware",
        type: "hardware",
        parameters: { unitsPerMonth: 200, pricePerUnit: 250, unitGrowthRate: 0, priceGrowthRate: 0 },
        startDate: new Date("2026-01-01"),
        endDate: null,
      },
      new Date("2026-01-01"),
      new Date("2026-03-01"),
    );
    expect(series.get("2026-01")).toBeCloseTo(50000, 2);
    expect(series.get("2026-02")).toBeCloseTo(50000, 2);
  });

  it("compounds both unit-growth and price-growth across months", () => {
    const series = computeRevenueStream(
      {
        id: "h2",
        name: "Hardware",
        type: "hardware",
        parameters: { unitsPerMonth: 100, pricePerUnit: 500, unitGrowthRate: 0.05, priceGrowthRate: -0.02 },
        startDate: new Date("2026-01-01"),
        endDate: null,
      },
      new Date("2026-01-01"),
      new Date("2026-04-01"),
    );
    // Month 0: 100 × 500 = 50000
    expect(series.get("2026-01")).toBeCloseTo(50000, 2);
    // Month 1: 100×1.05 × 500×0.98 = 105 × 490 = 51450
    expect(series.get("2026-02")).toBeCloseTo(51450, 2);
    // Month 2: 100×1.05^2 × 500×0.98^2 = 110.25 × 480.2 = 52942.05
    expect(series.get("2026-03")).toBeCloseTo(52942.05, 1);
  });
});
