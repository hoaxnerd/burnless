/**
 * Date serialization regression test — BUR-200
 *
 * When data functions are wrapped with Next.js unstable_cache, Date objects
 * get serialized to JSON strings during caching and deserialized as strings
 * (not Date objects). All engine functions now accept both Date objects and
 * ISO string dates via the toDate() coercion helper.
 */

import { describe, it, expect } from "vitest";
import { monthKey, monthRange, isActiveInMonth, proratedFraction, toDate } from "../utils";
import { computeAllForecastLines, type ForecastLineInput } from "../forecasting";
import { computeAllHeadcountCosts, type HeadcountPlanInput } from "../headcount";

describe("Date serialization regression (BUR-200)", () => {
  describe("toDate coercion", () => {
    it("passes through Date objects unchanged", () => {
      const d = new Date(2025, 0, 1);
      expect(toDate(d)).toBe(d);
    });

    it("coerces ISO strings to Date objects", () => {
      const result = toDate("2025-01-01T00:00:00.000Z");
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
    });

    it("coerces numeric timestamps to Date objects", () => {
      const ts = new Date(2025, 0, 1).getTime();
      const result = toDate(ts);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(ts);
    });
  });

  describe("utils functions with string dates", () => {
    it("monthKey handles Date objects", () => {
      expect(monthKey(new Date(2025, 0, 1))).toBe("2025-01");
    });

    it("monthKey handles ISO string input", () => {
      expect(monthKey("2025-01-01T00:00:00.000Z")).toBe("2025-01");
    });

    it("monthRange handles ISO string inputs", () => {
      const result = monthRange("2025-01-01T00:00:00.000Z", "2025-03-01T00:00:00.000Z");
      expect(result).toHaveLength(3);
      expect(result[0]!.getMonth()).toBe(0);
      expect(result[2]!.getMonth()).toBe(2);
    });

    it("isActiveInMonth handles ISO string startDate", () => {
      const month = new Date(2025, 5, 1);
      expect(isActiveInMonth(month, "2025-01-01T00:00:00.000Z", null)).toBe(true);
    });

    it("proratedFraction handles ISO string startDate correctly", () => {
      const month = new Date(2025, 5, 1); // June 2025

      // With proper Date: should return ~0.53 (16 of 30 days)
      const dateResult = proratedFraction(month, new Date(2025, 5, 15), null);
      expect(dateResult).toBeCloseTo(16 / 30, 1);

      // With string: should produce same result
      const stringResult = proratedFraction(month, "2025-06-15T00:00:00.000Z", null);
      expect(stringResult).toBeCloseTo(16 / 30, 1);
    });
  });

  describe("forecasting with string dates (unstable_cache simulation)", () => {
    it("computeAllForecastLines works when startDate is a string", () => {
      const inputs: ForecastLineInput[] = [
        {
          id: "fl-1",
          accountId: "acc-1",
          method: "fixed",
          parameters: { amount: 5000 },
          startDate: "2025-01-01T00:00:00.000Z" as unknown as Date,
          endDate: null,
        },
      ];

      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 11, 1);

      const results = computeAllForecastLines(inputs, start, end);
      expect(results.size).toBe(1);
      expect(results.get("fl-1")?.size).toBeGreaterThan(0);
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
    it("computeAllHeadcountCosts works when startDate is a string", () => {
      const inputs: HeadcountPlanInput[] = [
        {
          id: "hp-1",
          departmentId: "dept-1",
          title: "Engineer",
          count: 2,
          salary: 120000,
          startDate: "2025-01-01T00:00:00.000Z" as unknown as Date,
          endDate: null,
          benefitsRate: 0.2,
        },
      ];

      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 11, 1);

      const result = computeAllHeadcountCosts(inputs, start, end);
      expect(result.totalCost.size).toBeGreaterThan(0);
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
});
