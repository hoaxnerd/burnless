import { describe, expect, it } from "vitest";
import { computeRevenueStream } from "../revenue";

describe("revenue proration", () => {
  it("returns zero for months before startDate", () => {
    const stream = {
      id: "r1",
      name: "Stream",
      type: "subscription" as const,
      parameters: {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 0,
        monthlyChurnRate: 0,
      },
      startDate: new Date("2026-04-01"),
      endDate: null,
    };
    const series = computeRevenueStream(
      stream,
      new Date("2026-01-01"),
      new Date("2026-12-01"),
    );
    expect(series.get("2026-01")).toBe(0);
    expect(series.get("2026-02")).toBe(0);
    expect(series.get("2026-03")).toBe(0);
    expect(series.get("2026-04")).toBeCloseTo(5000, 2);
  });

  it("returns zero for months after endDate", () => {
    const stream = {
      id: "r2",
      name: "Stream",
      type: "subscription" as const,
      parameters: {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 0,
        monthlyChurnRate: 0,
      },
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-06-30"),
    };
    const series = computeRevenueStream(
      stream,
      new Date("2026-01-01"),
      new Date("2026-12-01"),
    );
    expect(series.get("2026-06")).toBeCloseTo(5000, 2);
    expect(series.get("2026-07")).toBe(0);
    expect(series.get("2026-12")).toBe(0);
  });

  it("prorates a mid-month start (April 15)", () => {
    const stream = {
      id: "r3",
      name: "Stream",
      type: "one_time" as const,
      parameters: { unitsPerMonth: 100, pricePerUnit: 30 },
      startDate: new Date("2026-04-15"),
      endDate: null,
    };
    const series = computeRevenueStream(
      stream,
      new Date("2026-04-01"),
      new Date("2026-05-01"),
    );
    // April 15-30 = 16 days / 30 days = 0.5333... → 100 * 30 * 0.5333 = ~1600
    expect(series.get("2026-04")).toBeGreaterThan(1500);
    expect(series.get("2026-04")).toBeLessThan(1700);
    expect(series.get("2026-05")).toBeCloseTo(3000, 2);
  });
});
