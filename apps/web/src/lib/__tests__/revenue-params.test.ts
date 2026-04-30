/**
 * Unit tests for revenue-params helpers.
 *
 * Guards contracts:
 *  - defaultParamsForType returns zero-seeded engine-canonical shapes
 *  - normalizeStreamPayload coerces date strings → Date instances and
 *    ensures parameters key is present
 *  - validateTiers throws descriptive errors for overlapping, non-monotonic,
 *    and misplaced open-ended ranges
 */

import { describe, it, expect } from "vitest";
import type { PricingTier } from "@burnless/engine";
import {
  defaultParamsForType,
  normalizeStreamPayload,
  validateTiers,
} from "../revenue-params";

// ── defaultParamsForType ─────────────────────────────────────────────────────

describe("defaultParamsForType", () => {
  it("subscription returns zero-seeded canonical params", () => {
    const params = defaultParamsForType("subscription");
    expect(params).toMatchObject({
      startingCustomers: 0,
      monthlyPrice: 0,
      newCustomersPerMonth: 0,
      monthlyChurnRate: 0,
    });
  });

  it("marketplace returns zero-seeded canonical params", () => {
    const params = defaultParamsForType("marketplace");
    expect(params).toMatchObject({
      startingGmv: 0,
      takeRate: 0,
    });
    // gmvGrowthRate is optional; if present it should be 0 or absent
    if ("gmvGrowthRate" in params) {
      expect(params.gmvGrowthRate).toBe(0);
    }
  });

  it("one_time returns zero-seeded canonical params", () => {
    const params = defaultParamsForType("one_time");
    expect(params).toMatchObject({ unitsPerMonth: 0, pricePerUnit: 0 });
  });

  it("usage_based returns zero-seeded canonical params", () => {
    const params = defaultParamsForType("usage_based");
    expect(params).toMatchObject({
      activeUsers: 0,
      avgUsagePerUser: 0,
      pricePerUnit: 0,
    });
  });

  it("services returns zero-seeded canonical params", () => {
    const params = defaultParamsForType("services");
    expect(params).toMatchObject({ hoursPerMonth: 0, hourlyRate: 0 });
  });

  it("ecommerce returns zero-seeded canonical params", () => {
    const params = defaultParamsForType("ecommerce");
    expect(params).toMatchObject({ ordersPerMonth: 0, averageOrderValue: 0 });
  });

  it("hardware returns zero-seeded canonical params", () => {
    const params = defaultParamsForType("hardware");
    expect(params).toMatchObject({ unitsPerMonth: 0, pricePerUnit: 0 });
  });
});

// ── normalizeStreamPayload ───────────────────────────────────────────────────

describe("normalizeStreamPayload", () => {
  it("converts string dates to Date instances", () => {
    const result = normalizeStreamPayload({
      name: "SaaS Revenue",
      type: "subscription",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      parameters: {},
    });
    expect(result.startDate).toBeInstanceOf(Date);
    expect(result.endDate).toBeInstanceOf(Date);
    expect(result.startDate.getFullYear()).toBe(2026);
    expect(result.startDate.getMonth()).toBe(0); // January
  });

  it("preserves Date instances as-is", () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 31);
    const result = normalizeStreamPayload({
      name: "Services",
      type: "services",
      startDate: start,
      endDate: end,
      parameters: { hoursPerMonth: 100, hourlyRate: 200 },
    });
    expect(result.startDate).toBe(start);
    expect(result.endDate).toBe(end);
  });

  it("passes through null endDate", () => {
    const result = normalizeStreamPayload({
      name: "Ongoing",
      type: "subscription",
      startDate: "2026-01-01",
      endDate: null,
    });
    expect(result.endDate).toBeNull();
  });

  it("ensures parameters key is present even when omitted", () => {
    const result = normalizeStreamPayload({
      name: "Test",
      type: "one_time",
      startDate: "2026-01-01",
      endDate: null,
    });
    expect(result.parameters).toBeDefined();
    expect(typeof result.parameters).toBe("object");
  });

  it("preserves provided parameters", () => {
    const params = { unitsPerMonth: 50, pricePerUnit: 100 };
    const result = normalizeStreamPayload({
      name: "Test",
      type: "one_time",
      startDate: "2026-01-01",
      endDate: null,
      parameters: params,
    });
    expect(result.parameters).toEqual(params);
  });
});

// ── validateTiers ────────────────────────────────────────────────────────────

describe("validateTiers", () => {
  it("accepts empty tiers without throwing", () => {
    expect(() => validateTiers([])).not.toThrow();
  });

  it("accepts a single open-ended tier", () => {
    const tiers: PricingTier[] = [
      { name: "Standard", minUnits: 0, maxUnits: null, pricePerUnit: 0.01 },
    ];
    expect(() => validateTiers(tiers)).not.toThrow();
  });

  it("accepts a valid ordered, non-overlapping tier set", () => {
    const tiers: PricingTier[] = [
      { name: "Starter", minUnits: 0, maxUnits: 1000, pricePerUnit: 0.05 },
      { name: "Growth", minUnits: 1001, maxUnits: 10000, pricePerUnit: 0.03 },
      { name: "Enterprise", minUnits: 10001, maxUnits: null, pricePerUnit: 0.01 },
    ];
    expect(() => validateTiers(tiers)).not.toThrow();
  });

  it("rejects overlapping ranges (throws /overlap/i)", () => {
    const tiers: PricingTier[] = [
      { name: "A", minUnits: 0, maxUnits: 10, pricePerUnit: 0.05 },
      { name: "B", minUnits: 5, maxUnits: 20, pricePerUnit: 0.03 },
    ];
    expect(() => validateTiers(tiers)).toThrowError(/overlap/i);
  });

  it("rejects non-monotonic minUnits (throws /ascending|monotonic/i)", () => {
    const tiers: PricingTier[] = [
      { name: "A", minUnits: 10, maxUnits: 20, pricePerUnit: 0.05 },
      { name: "B", minUnits: 0, maxUnits: 9, pricePerUnit: 0.03 },
    ];
    expect(() => validateTiers(tiers)).toThrowError(/ascending|monotonic/i);
  });

  it("rejects null maxUnits not at the last position (throws /null.*last/i)", () => {
    const tiers: PricingTier[] = [
      { name: "A", minUnits: 0, maxUnits: null, pricePerUnit: 0.05 },
      { name: "B", minUnits: 100, maxUnits: 200, pricePerUnit: 0.03 },
    ];
    expect(() => validateTiers(tiers)).toThrowError(/null.*last/i);
  });

  it("rejects equal minUnits (non-strictly-ascending) (throws /ascending|monotonic/i)", () => {
    const tiers: PricingTier[] = [
      { name: "A", minUnits: 0, maxUnits: 100, pricePerUnit: 0.05 },
      { name: "B", minUnits: 0, maxUnits: 200, pricePerUnit: 0.03 },
    ];
    expect(() => validateTiers(tiers)).toThrowError(/ascending|monotonic/i);
  });
});
