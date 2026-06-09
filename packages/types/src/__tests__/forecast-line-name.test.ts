import { describe, it, expect } from "vitest";
import {
  createForecastLineSchema,
  updateForecastLineSchema,
} from "../api/schemas";

/**
 * Phase 4 §4.1 — `forecastLines.name` is a sanitized identifier used to
 * reference a line from another line's `custom_formula` expression.
 * Rule: `^[A-Za-z_][A-Za-z0-9_]*$`, 1–64 chars after trim. null/undefined OK.
 */
describe("forecast-line schemas: name identifier", () => {
  const base = {
    accountId: "acct-1",
    startDate: "2026-01-01",
    parameters: { amount: 100 },
  };

  describe("createForecastLineSchema", () => {
    it("accepts a valid identifier (CloudCosts)", () => {
      const r = createForecastLineSchema.safeParse({ ...base, name: "CloudCosts" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.name).toBe("CloudCosts");
    });

    it("accepts a leading-underscore identifier (_line_2)", () => {
      const r = createForecastLineSchema.safeParse({ ...base, name: "_line_2" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.name).toBe("_line_2");
    });

    it("accepts null", () => {
      const r = createForecastLineSchema.safeParse({ ...base, name: null });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.name).toBeNull();
    });

    it("accepts omitted (undefined)", () => {
      const r = createForecastLineSchema.safeParse({ ...base });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.name).toBeUndefined();
    });

    it("rejects a leading-digit identifier (2cool)", () => {
      const r = createForecastLineSchema.safeParse({ ...base, name: "2cool" });
      expect(r.success).toBe(false);
    });

    it("rejects a hyphenated identifier (cloud-costs)", () => {
      const r = createForecastLineSchema.safeParse({ ...base, name: "cloud-costs" });
      expect(r.success).toBe(false);
    });

    it("rejects a spaced identifier (cloud costs)", () => {
      const r = createForecastLineSchema.safeParse({ ...base, name: "cloud costs" });
      expect(r.success).toBe(false);
    });

    it("rejects another leading-digit identifier (1bad)", () => {
      const r = createForecastLineSchema.safeParse({ ...base, name: "1bad" });
      expect(r.success).toBe(false);
    });
  });

  describe("updateForecastLineSchema", () => {
    it("accepts a valid identifier", () => {
      const r = updateForecastLineSchema.safeParse({ name: "CloudCosts" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.name).toBe("CloudCosts");
    });

    it("accepts null (clear)", () => {
      const r = updateForecastLineSchema.safeParse({ name: null });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.name).toBeNull();
    });

    it("rejects a hyphenated identifier", () => {
      const r = updateForecastLineSchema.safeParse({ name: "cloud-costs" });
      expect(r.success).toBe(false);
    });

    it("rejects a leading-digit identifier", () => {
      const r = updateForecastLineSchema.safeParse({ name: "1bad" });
      expect(r.success).toBe(false);
    });
  });
});
