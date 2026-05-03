/**
 * Schema validation tests for revenue stream AI tool inputs.
 *
 * Scoped to Zod contract enforcement — no DB calls.
 */
import { describe, it, expect } from "vitest";
import {
  AddRevenueStreamSchema,
  UpdateRevenueStreamSchema,
} from "@burnless/ai";

// ── Helpers ───────────────────────────────────────────────────────────────────

const validAdd = {
  name: "SaaS Subscriptions",
  type: "subscription" as const,
  startDate: "2025-01-01",
  parameters: {
    startingCustomers: 10,
    monthlyPrice: 99,
    newCustomersPerMonth: 5,
    monthlyChurnRate: 0.05,
  },
};

// ── UpdateRevenueStreamSchema ─────────────────────────────────────────────────

describe("UpdateRevenueStreamSchema", () => {
  it("parses successfully with startDate only", () => {
    const result = UpdateRevenueStreamSchema.safeParse({
      id: "rs_abc123",
      startDate: "2025-03-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startDate).toBe("2025-03-01");
    }
  });

  it("parses successfully when updating parameters", () => {
    const result = UpdateRevenueStreamSchema.safeParse({
      id: "rs_abc123",
      parameters: { monthlyChurnRate: 0.03, monthlyPrice: 149 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parameters).toEqual({
        monthlyChurnRate: 0.03,
        monthlyPrice: 149,
      });
    }
  });

  it("rejects invalid type value", () => {
    const result = UpdateRevenueStreamSchema.safeParse({
      id: "rs_abc123",
      type: "foo",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/Invalid enum value/i);
    }
  });

  it("parses endDate: null (clearing end date)", () => {
    const result = UpdateRevenueStreamSchema.safeParse({
      id: "rs_abc123",
      endDate: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.endDate).toBeNull();
    }
  });

  it("accepts all 7 revenue stream types", () => {
    const types = [
      "subscription",
      "one_time",
      "usage_based",
      "services",
      "marketplace",
      "ecommerce",
      "hardware",
    ] as const;

    for (const type of types) {
      const result = UpdateRevenueStreamSchema.safeParse({
        id: "rs_abc123",
        type,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ── AddRevenueStreamSchema ────────────────────────────────────────────────────

describe("AddRevenueStreamSchema", () => {
  it("accepts marketplace type with valid MarketplaceParams", () => {
    const result = AddRevenueStreamSchema.safeParse({
      name: "App Store",
      type: "marketplace",
      startDate: "2025-01-01",
      parameters: {
        startingGmv: 100000,
        takeRate: 0.15,
        gmvGrowthRate: 0.1,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid subscription stream", () => {
    const result = AddRevenueStreamSchema.safeParse(validAdd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("subscription");
      expect(result.data.startDate).toBe("2025-01-01");
    }
  });

  it("rejects missing startDate", () => {
    const { startDate: _sd, ...withoutDate } = validAdd;
    const result = AddRevenueStreamSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it("accepts endDate as a valid date string", () => {
    const result = AddRevenueStreamSchema.safeParse({
      ...validAdd,
      endDate: "2025-12-31",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.endDate).toBe("2025-12-31");
    }
  });

  it("accepts endDate as null (open-ended)", () => {
    const result = AddRevenueStreamSchema.safeParse({
      ...validAdd,
      endDate: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.endDate).toBeNull();
    }
  });

  it("rejects invalid type value", () => {
    const result = AddRevenueStreamSchema.safeParse({
      ...validAdd,
      type: "foo",
    });
    expect(result.success).toBe(false);
  });
});
