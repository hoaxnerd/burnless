import { describe, expect, it } from "vitest";

// We test the pure helpers we'll extract. Module structure (post-refactor in Task 9):
//   - shouldFlagAnomaly(line, currentMonth, prevAmount, currentAmount): boolean
//   - getAnomalyBaseline(line, currentMonth, series): number
//   - suggestRecurring(amounts: number[]): { likely: boolean; reason: string }
import {
  shouldFlagAnomaly,
  getAnomalyBaseline,
  suggestRecurring,
} from "../compute-expenses-helpers";

describe("anomaly: endDate gate", () => {
  it("does not flag the month immediately after endDate", () => {
    const line = {
      method: "fixed" as const,
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      frequency: "monthly" as const,
    };
    // Current month is 2026-07; previous was 2026-06 with $5000.
    expect(shouldFlagAnomaly(line, "2026-07", 5000, 0)).toBe(false);
  });

  it("flags a 50% drop when stream is still active", () => {
    const line = {
      method: "fixed" as const,
      startDate: "2026-01-01",
      endDate: null,
      frequency: "monthly" as const,
    };
    expect(shouldFlagAnomaly(line, "2026-07", 5000, 2500)).toBe(true);
  });
});

describe("anomaly: frequency-aware baseline", () => {
  it("monthly compares to previous month", () => {
    const series = new Map([
      ["2026-01", 100],
      ["2026-02", 100],
      ["2026-03", 100],
    ]);
    expect(getAnomalyBaseline(
      { frequency: "monthly", startDate: "2026-01-01", endDate: null, method: "fixed" },
      "2026-03",
      series,
    )).toBe(100);
  });

  it("quarterly compares to 3 months ago", () => {
    const series = new Map([
      ["2026-01", 1000],
      ["2026-02", 0],
      ["2026-03", 0],
      ["2026-04", 1100],
    ]);
    expect(getAnomalyBaseline(
      { frequency: "quarterly", startDate: "2026-01-01", endDate: null, method: "fixed" },
      "2026-04",
      series,
    )).toBe(1000);
  });

  it("annual compares to 12 months ago", () => {
    const series = new Map([
      ["2025-04", 12000],
      ["2026-04", 13000],
    ]);
    expect(getAnomalyBaseline(
      { frequency: "annual", startDate: "2025-04-01", endDate: null, method: "fixed" },
      "2026-04",
      series,
    )).toBe(12000);
  });
});

describe("recurring suggestion", () => {
  it("returns likely=true for low-variance series", () => {
    const r = suggestRecurring([100, 102, 99, 101, 100]);
    expect(r.likely).toBe(true);
  });

  it("returns likely=false for high-variance series", () => {
    const r = suggestRecurring([100, 1000, 50, 800, 100]);
    expect(r.likely).toBe(false);
  });

  it("returns likely=false for too-few samples", () => {
    const r = suggestRecurring([100, 100]);
    expect(r.likely).toBe(false);
    expect(r.reason).toMatch(/sample/i);
  });
});
