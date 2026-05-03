import { describe, expect, it } from "vitest";
import { computeRevenueStream } from "../revenue";

describe("marketplace revenue", () => {
  it("computes take-rate revenue from GMV", () => {
    const series = computeRevenueStream(
      {
        id: "m1",
        name: "Marketplace",
        type: "marketplace",
        parameters: { startingGmv: 100000, takeRate: 0.15, gmvGrowthRate: 0 },
        startDate: new Date("2026-01-01"),
        endDate: null,
      },
      new Date("2026-01-01"),
      new Date("2026-03-01"),
    );
    expect(series.get("2026-01")).toBeCloseTo(15000, 2);
    expect(series.get("2026-02")).toBeCloseTo(15000, 2);
  });

  it("compounds GMV growth across months", () => {
    const series = computeRevenueStream(
      {
        id: "m2",
        name: "Marketplace",
        type: "marketplace",
        parameters: { startingGmv: 100000, takeRate: 0.10, gmvGrowthRate: 0.10 },
        startDate: new Date("2026-01-01"),
        endDate: null,
      },
      new Date("2026-01-01"),
      new Date("2026-04-01"),
    );
    expect(series.get("2026-01")).toBeCloseTo(10000, 2);
    expect(series.get("2026-02")).toBeCloseTo(11000, 2);
    expect(series.get("2026-03")).toBeCloseTo(12100, 2);
  });
});
