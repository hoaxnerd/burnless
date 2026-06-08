import { describe, it, expect } from "vitest";
import {
  createRevenueStreamSchema,
  updateRevenueStreamSchema,
  createHeadcountSchema,
  createForecastLineSchema,
} from "../api/schemas";

/**
 * Guard for VAL-03 / DATE-03 (systemic) and REV-01 (QA finding).
 *
 * Contract: any shared schema declaring BOTH a start date and an end date must
 * reject an end date that is earlier than the start date (cross-field invariant).
 * Today there are ZERO `.refine`/`.superRefine` cross-field guards in the shared
 * schema layer, so an inverted range passes Zod, persists, and the engine yields
 * an empty MonthlySeries -> a silent $0 stream (REV-01).
 *
 * These assertions FAIL RED until a `endDate >= startDate` cross-field refine is
 * added to the start/end schemas in packages/types/src/api/schemas.ts.
 */
describe("VAL-03/DATE-03: schemas reject endDate earlier than startDate", () => {
  describe("createRevenueStreamSchema", () => {
    it("rejects endDate before startDate", () => {
      const result = createRevenueStreamSchema.safeParse({
        name: "Inverted stream",
        type: "subscription",
        startDate: "2026-06-01",
        endDate: "2026-01-01", // before start
        parameters: {},
      });
      expect(result.success).toBe(false);
    });

    it("accepts a valid (start <= end) range", () => {
      const result = createRevenueStreamSchema.safeParse({
        name: "Valid stream",
        type: "subscription",
        startDate: "2026-01-01",
        endDate: "2026-06-01",
        parameters: {},
      });
      expect(result.success).toBe(true);
    });

    it("accepts a null endDate (open-ended)", () => {
      const result = createRevenueStreamSchema.safeParse({
        name: "Open stream",
        type: "subscription",
        startDate: "2026-01-01",
        endDate: null,
        parameters: {},
      });
      expect(result.success).toBe(true);
    });
  });

  describe("updateRevenueStreamSchema", () => {
    it("rejects endDate before startDate when both supplied", () => {
      const result = updateRevenueStreamSchema.safeParse({
        startDate: "2026-06-01",
        endDate: "2026-01-01",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createHeadcountSchema", () => {
    it("rejects endDate before startDate", () => {
      const result = createHeadcountSchema.safeParse({
        departmentId: "dept-1",
        title: "Engineer",
        salary: 100000,
        startDate: "2026-06-01",
        endDate: "2026-01-01", // before start
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createForecastLineSchema", () => {
    it("rejects endDate before startDate", () => {
      const result = createForecastLineSchema.safeParse({
        accountId: "acct-1",
        method: "fixed",
        parameters: {},
        startDate: "2026-06-01",
        endDate: "2026-01-01", // before start
      });
      expect(result.success).toBe(false);
    });
  });
});
