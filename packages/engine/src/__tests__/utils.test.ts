import { describe, it, expect } from "vitest";
import {
  monthRange,
  monthKey,
  parseMonthKey,
  round2,
  isActiveInMonth,
  proratedFraction,
  sum,
  emptySeries,
  addSeries,
  subtractSeries,
  scaleSeries,
  seriesToArray,
} from "../utils";

describe("utils", () => {
  describe("monthRange", () => {
    it("generates inclusive range of first-of-month dates", () => {
      const result = monthRange(new Date(2026, 0, 1), new Date(2026, 2, 1));
      expect(result).toHaveLength(3);
      expect(result[0]!.getMonth()).toBe(0);
      expect(result[1]!.getMonth()).toBe(1);
      expect(result[2]!.getMonth()).toBe(2);
    });

    it("returns single month when start equals end", () => {
      const result = monthRange(new Date(2026, 5, 1), new Date(2026, 5, 1));
      expect(result).toHaveLength(1);
    });

    it("returns empty array when start is after end", () => {
      const result = monthRange(new Date(2026, 5, 1), new Date(2026, 0, 1));
      expect(result).toHaveLength(0);
    });

    it("handles cross-year ranges", () => {
      const result = monthRange(new Date(2025, 10, 1), new Date(2026, 1, 1));
      expect(result).toHaveLength(4); // Nov, Dec, Jan, Feb
    });

    it("normalizes mid-month dates to first of month", () => {
      const result = monthRange(new Date(2026, 0, 15), new Date(2026, 2, 20));
      expect(result).toHaveLength(3);
      expect(result[0]!.getDate()).toBe(1);
    });
  });

  describe("monthKey", () => {
    it("formats date as YYYY-MM", () => {
      expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
      expect(monthKey(new Date(2026, 11, 15))).toBe("2026-12");
    });

    it("pads single-digit months", () => {
      expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
      expect(monthKey(new Date(2026, 8, 1))).toBe("2026-09");
    });
  });

  describe("parseMonthKey", () => {
    it("parses YYYY-MM to first-of-month Date", () => {
      const result = parseMonthKey("2026-03");
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(2); // 0-indexed
      expect(result.getDate()).toBe(1);
    });

    it("handles edge case months", () => {
      const jan = parseMonthKey("2026-01");
      expect(jan.getMonth()).toBe(0);
      const dec = parseMonthKey("2026-12");
      expect(dec.getMonth()).toBe(11);
    });
  });

  describe("round2", () => {
    it("rounds to 2 decimal places — half away from zero", () => {
      expect(round2(1.005)).toBe(1.01);
      expect(round2(1.015)).toBe(1.02);
      expect(round2(2.675)).toBe(2.68);
      expect(round2(1.1249)).toBe(1.12);
      expect(round2(1.125)).toBe(1.13);
    });

    it("handles negative numbers (half away from zero)", () => {
      expect(round2(-1.005)).toBe(-1.01);
      expect(round2(-1.125)).toBe(-1.13);
      expect(round2(-0.005)).toBe(-0.01);
      expect(round2(-2.675)).toBe(-2.68);
    });

    it("handles zero", () => {
      expect(round2(0)).toBe(0);
    });

    it("handles very large numbers", () => {
      expect(round2(999999999.999)).toBe(1000000000);
      expect(round2(123456789.12)).toBe(123456789.12);
    });

    it("handles integers", () => {
      expect(round2(42)).toBe(42);
    });
  });

  describe("isActiveInMonth", () => {
    it("returns true when month is within range", () => {
      expect(
        isActiveInMonth(new Date(2026, 1, 1), new Date(2026, 0, 1), new Date(2026, 5, 30))
      ).toBe(true);
    });

    it("returns false when month is before start", () => {
      expect(
        isActiveInMonth(new Date(2025, 11, 1), new Date(2026, 0, 15), null)
      ).toBe(false);
    });

    it("returns false when month is after end", () => {
      expect(
        isActiveInMonth(new Date(2026, 6, 1), new Date(2026, 0, 1), new Date(2026, 5, 15))
      ).toBe(false);
    });

    it("returns true when endDate is null (open-ended)", () => {
      expect(
        isActiveInMonth(new Date(2030, 0, 1), new Date(2026, 0, 1), null)
      ).toBe(true);
    });

    it("handles start date mid-month", () => {
      // Start on Jan 15, check Jan — should be active
      expect(
        isActiveInMonth(new Date(2026, 0, 1), new Date(2026, 0, 15), null)
      ).toBe(true);
    });

    it("handles end date mid-month", () => {
      // End on Jan 15, check Jan — should be active
      expect(
        isActiveInMonth(new Date(2026, 0, 1), new Date(2025, 0, 1), new Date(2026, 0, 15))
      ).toBe(true);
    });
  });

  describe("proratedFraction", () => {
    it("returns 1 for a full month", () => {
      const frac = proratedFraction(
        new Date(2026, 0, 1),
        new Date(2025, 0, 1),
        null
      );
      expect(frac).toBe(1);
    });

    it("prorates for mid-month start", () => {
      // Jan 2026 has 31 days. Start on Jan 16 = 16 active days (16-31)
      const frac = proratedFraction(
        new Date(2026, 0, 1),
        new Date(2026, 0, 16),
        null
      );
      expect(frac).toBeCloseTo(16 / 31, 2);
    });

    it("prorates for mid-month end", () => {
      // Jan 2026: end on Jan 15 = 15 active days (1-15)
      const frac = proratedFraction(
        new Date(2026, 0, 1),
        new Date(2025, 0, 1),
        new Date(2026, 0, 15)
      );
      expect(frac).toBeCloseTo(15 / 31, 2);
    });

    it("returns 0 when start is after month end", () => {
      const frac = proratedFraction(
        new Date(2026, 0, 1),
        new Date(2026, 1, 1),
        null
      );
      expect(frac).toBe(0);
    });

    it("handles February (28 days)", () => {
      // Feb 2026 has 28 days, start Feb 15 = 14 active days (15-28)
      const frac = proratedFraction(
        new Date(2026, 1, 1),
        new Date(2026, 1, 15),
        null
      );
      expect(frac).toBeCloseTo(14 / 28, 2);
    });
  });

  describe("sum", () => {
    it("sums an array of numbers", () => {
      expect(sum([1, 2, 3, 4])).toBe(10);
    });

    it("returns 0 for empty array", () => {
      expect(sum([])).toBe(0);
    });

    it("handles negative numbers", () => {
      expect(sum([10, -3, -7])).toBe(0);
    });

    it("handles single element", () => {
      expect(sum([42])).toBe(42);
    });
  });

  describe("emptySeries", () => {
    it("creates a series with all zeros", () => {
      const s = emptySeries(new Date(2026, 0, 1), new Date(2026, 2, 1));
      expect(s.size).toBe(3);
      expect(s.get("2026-01")).toBe(0);
      expect(s.get("2026-02")).toBe(0);
      expect(s.get("2026-03")).toBe(0);
    });
  });

  describe("addSeries", () => {
    it("adds two series with same keys", () => {
      const a = new Map([["2026-01", 100], ["2026-02", 200]]);
      const b = new Map([["2026-01", 50], ["2026-02", 75]]);
      const result = addSeries(a, b);
      expect(result.get("2026-01")).toBe(150);
      expect(result.get("2026-02")).toBe(275);
    });

    it("handles disjoint keys (union)", () => {
      const a = new Map([["2026-01", 100]]);
      const b = new Map([["2026-02", 200]]);
      const result = addSeries(a, b);
      expect(result.get("2026-01")).toBe(100);
      expect(result.get("2026-02")).toBe(200);
    });

    it("handles empty series", () => {
      const a = new Map([["2026-01", 100]]);
      const b = new Map<string, number>();
      const result = addSeries(a, b);
      expect(result.get("2026-01")).toBe(100);
    });
  });

  describe("subtractSeries", () => {
    it("subtracts b from a", () => {
      const a = new Map([["2026-01", 100]]);
      const b = new Map([["2026-01", 30]]);
      const result = subtractSeries(a, b);
      expect(result.get("2026-01")).toBe(70);
    });

    it("produces negative values when b > a", () => {
      const a = new Map([["2026-01", 10]]);
      const b = new Map([["2026-01", 30]]);
      const result = subtractSeries(a, b);
      expect(result.get("2026-01")).toBe(-20);
    });

    it("creates negative entry for keys only in b", () => {
      const a = new Map<string, number>();
      const b = new Map([["2026-01", 50]]);
      const result = subtractSeries(a, b);
      expect(result.get("2026-01")).toBe(-50);
    });
  });

  describe("scaleSeries", () => {
    it("multiplies all values by factor", () => {
      const s = new Map([["2026-01", 100], ["2026-02", 200]]);
      const result = scaleSeries(s, 1.5);
      expect(result.get("2026-01")).toBe(150);
      expect(result.get("2026-02")).toBe(300);
    });

    it("handles zero factor", () => {
      const s = new Map([["2026-01", 100]]);
      const result = scaleSeries(s, 0);
      expect(result.get("2026-01")).toBe(0);
    });

    it("handles negative factor", () => {
      const s = new Map([["2026-01", 100]]);
      const result = scaleSeries(s, -1);
      expect(result.get("2026-01")).toBe(-100);
    });
  });

  describe("seriesToArray", () => {
    it("converts to sorted array with rounded values", () => {
      const s = new Map([["2026-02", 200.005], ["2026-01", 100.123]]);
      const result = seriesToArray(s);
      expect(result).toEqual([
        { month: "2026-01", value: 100.12 },
        { month: "2026-02", value: 200.01 },
      ]);
    });

    it("returns empty array for empty series", () => {
      expect(seriesToArray(new Map())).toEqual([]);
    });
  });
});
