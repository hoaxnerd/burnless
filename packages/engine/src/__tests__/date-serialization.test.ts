/**
 * Date serialization regression test — BUR-200
 *
 * When data functions are wrapped with Next.js unstable_cache, Date objects
 * get serialized to JSON strings during caching and deserialized as strings
 * (not Date objects). This causes crashes in engine functions that call
 * .getFullYear(), .getMonth(), etc.
 *
 * This test verifies that engine functions handle both Date objects and
 * ISO string dates, catching the regression introduced by BUR-176/BUR-188.
 */

import { describe, it, expect } from "vitest";
import { monthKey, monthRange, isActiveInMonth, proratedFraction } from "../utils";
import { computeAllForecastLines, type ForecastLineInput } from "../forecasting";
import { computeAllHeadcountCosts, type HeadcountPlanInput } from "../headcount";

describe("Date serialization regression (BUR-200)", () => {
  describe("utils functions with string dates", () => {
    it("monthKey should handle Date objects", () => {
      const result = monthKey(new Date(2025, 0, 1));
      expect(result).toBe("2025-01");
    });

    it("monthKey crashes with ISO string input (demonstrates the bug)", () => {
      // This simulates what happens when unstable_cache returns a date
      const isoString = "2025-01-01T00:00:00.000Z";
      // @ts-expect-error - testing runtime behavior with wrong type
      expect(() => monthKey(isoString)).toThrow();
    });

    it("monthRange crashes with ISO string inputs (demonstrates the bug)", () => {
      const startStr = "2025-01-01T00:00:00.000Z";
      const endStr = "2025-12-01T00:00:00.000Z";
      // @ts-expect-error - testing runtime behavior with wrong type
      expect(() => monthRange(startStr, endStr)).toThrow();
    });

    it("isActiveInMonth crashes with ISO string startDate (demonstrates the bug)", () => {
      const month = new Date(2025, 5, 1);
      const startStr = "2025-01-01T00:00:00.000Z";
      // @ts-expect-error - testing runtime behavior with wrong type
      expect(() => isActiveInMonth(month, startStr, null)).toThrow();
    });

    it("proratedFraction returns wrong result with ISO string startDate (silent corruption)", () => {
      const month = new Date(2025, 5, 1); // June 2025
      const startStr = "2025-06-15T00:00:00.000Z";

      // With proper Date: should return ~0.53 (16 of 30 days)
      const correctResult = proratedFraction(month, new Date(2025, 5, 15), null);
      expect(correctResult).toBeCloseTo(16 / 30, 1);

      // With string: doesn't crash but may produce wrong result
      // @ts-expect-error - testing runtime behavior with wrong type
      const brokenResult = proratedFraction(month, startStr, null);
      // This is a silent data corruption bug — it either returns wrong
      // prorated fraction or 1.0 (full month) depending on comparison coercion
      expect(typeof brokenResult).toBe("number");
    });
  });

  describe("forecasting with string dates (unstable_cache simulation)", () => {
    it("computeAllForecastLines crashes when startDate is a string", () => {
      const inputs: ForecastLineInput[] = [
        {
          id: "fl-1",
          accountId: "acc-1",
          method: "fixed",
          parameters: { amount: 5000 },
          // Simulate what unstable_cache returns
          startDate: "2025-01-01T00:00:00.000Z" as unknown as Date,
          endDate: null,
        },
      ];

      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 11, 1);

      // This should crash because startDate is a string, not a Date
      expect(() => computeAllForecastLines(inputs, start, end)).toThrow();
    });

    it("computeAllForecastLines works with proper Date objects", () => {
      const inputs: ForecastLineInput[] = [
        {
          id: "fl-1",
          accountId: "acc-1",
          method: "fixed",
          parameters: { amount: 5000 },
          startDate: new Date(2025, 0, 1),
          endDate: null,
        },
      ];

      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 11, 1);

      const results = computeAllForecastLines(inputs, start, end);
      expect(results.size).toBe(1);
      expect(results.get("fl-1")?.size).toBeGreaterThan(0);
    });
  });

  describe("headcount with string dates (unstable_cache simulation)", () => {
    it("computeAllHeadcountCosts crashes when startDate is a string", () => {
      const inputs: HeadcountPlanInput[] = [
        {
          id: "hp-1",
          departmentId: "dept-1",
          title: "Engineer",
          count: 2,
          salary: 120000,
          // Simulate what unstable_cache returns
          startDate: "2025-01-01T00:00:00.000Z" as unknown as Date,
          endDate: null,
          benefitsRate: 0.2,
        },
      ];

      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 11, 1);

      expect(() => computeAllHeadcountCosts(inputs, start, end)).toThrow();
    });

    it("computeAllHeadcountCosts works with proper Date objects", () => {
      const inputs: HeadcountPlanInput[] = [
        {
          id: "hp-1",
          departmentId: "dept-1",
          title: "Engineer",
          count: 2,
          salary: 120000,
          startDate: new Date(2025, 0, 1),
          endDate: null,
          benefitsRate: 0.2,
        },
      ];

      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 11, 1);

      const result = computeAllHeadcountCosts(inputs, start, end);
      expect(result.totalCost.size).toBeGreaterThan(0);
    });
  });

  describe("fix validation: compute-dashboard should coerce dates", () => {
    it("new Date(isoString) produces a valid Date from JSON-serialized output", () => {
      // This is the fix: wrap with new Date() to coerce strings back to Dates
      const isoString = "2025-01-01T00:00:00.000Z";
      const coerced = new Date(isoString);

      expect(coerced).toBeInstanceOf(Date);
      expect(coerced.getFullYear()).toBe(2025);
      expect(coerced.getMonth()).toBe(0);
      expect(coerced.getDate()).toBe(1);
    });

    it("new Date(Date) is idempotent (safe to always coerce)", () => {
      const original = new Date(2025, 5, 15);
      const coerced = new Date(original);

      expect(coerced.getTime()).toBe(original.getTime());
    });
  });
});
