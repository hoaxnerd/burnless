import { describe, it, expect } from "vitest";
import {
  createForecastLineSchema,
  updateForecastLineSchema,
} from "../api/schemas";

/**
 * Per-line expense category override. The expense form sets `subcategory`:
 *   string = set, null = clear (derive automatically), omitted = leave as-is.
 */
describe("forecast-line schemas: subcategory override", () => {
  const base = {
    accountId: "acct-1",
    startDate: "2026-01-01",
    parameters: { amount: 100 },
  };

  describe("createForecastLineSchema", () => {
    it("accepts a string subcategory", () => {
      const r = createForecastLineSchema.safeParse({ ...base, subcategory: "Marketing" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.subcategory).toBe("Marketing");
    });

    it("accepts null (clear the override)", () => {
      const r = createForecastLineSchema.safeParse({ ...base, subcategory: null });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.subcategory).toBeNull();
    });

    it("accepts omitted (untouched)", () => {
      const r = createForecastLineSchema.safeParse({ ...base });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.subcategory).toBeUndefined();
    });

    it("rejects an over-long subcategory", () => {
      const r = createForecastLineSchema.safeParse({ ...base, subcategory: "x".repeat(101) });
      expect(r.success).toBe(false);
    });
  });

  describe("updateForecastLineSchema", () => {
    it("accepts a string subcategory", () => {
      const r = updateForecastLineSchema.safeParse({ subcategory: "Payroll" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.subcategory).toBe("Payroll");
    });

    it("accepts null (clear the override)", () => {
      const r = updateForecastLineSchema.safeParse({ subcategory: null });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.subcategory).toBeNull();
    });

    it("accepts omitted (untouched)", () => {
      const r = updateForecastLineSchema.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.subcategory).toBeUndefined();
    });
  });
});
