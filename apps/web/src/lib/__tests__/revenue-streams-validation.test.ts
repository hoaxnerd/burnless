/**
 * Revenue streams validation test suite — BUR-68
 *
 * Tests the Zod schemas used by /api/revenue-streams endpoints.
 * Validates input validation catches bad data before it hits the database.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Reproduce the exact schemas from the route handlers
const createSchema = z.object({
  scenarioId: z.string(),
  name: z.string().min(1),
  type: z.enum(["subscription", "one_time", "usage_based", "services"]).default("subscription"),
  parameters: z.record(z.unknown()).default({}),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["subscription", "one_time", "usage_based", "services"]).optional(),
  parameters: z.record(z.unknown()).optional(),
});

describe("Revenue stream create schema", () => {
  it("accepts valid subscription stream", () => {
    const result = createSchema.safeParse({
      scenarioId: "abc-123",
      name: "SaaS Revenue",
      type: "subscription",
      parameters: {
        startingCustomers: 100,
        monthlyPrice: 50,
        newCustomersPerMonth: 10,
        monthlyChurnRate: 0.05,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("subscription");
    }
  });

  it("defaults type to subscription when omitted", () => {
    const result = createSchema.safeParse({
      scenarioId: "abc-123",
      name: "Default Type",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("subscription");
      expect(result.data.parameters).toEqual({});
    }
  });

  it("accepts all valid stream types", () => {
    for (const type of ["subscription", "one_time", "usage_based", "services"]) {
      const result = createSchema.safeParse({
        scenarioId: "s-1",
        name: `${type} stream`,
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid stream type", () => {
    const result = createSchema.safeParse({
      scenarioId: "s-1",
      name: "Bad Type",
      type: "recurring", // not a valid type
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing scenarioId", () => {
    const result = createSchema.safeParse({
      name: "No Scenario",
      type: "subscription",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createSchema.safeParse({
      scenarioId: "s-1",
      type: "subscription",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createSchema.safeParse({
      scenarioId: "s-1",
      name: "",
      type: "subscription",
    });
    expect(result.success).toBe(false);
  });

  it("accepts complex parameters", () => {
    const result = createSchema.safeParse({
      scenarioId: "s-1",
      name: "Usage API",
      type: "usage_based",
      parameters: {
        activeUsers: 500,
        avgUsagePerUser: 1000,
        pricePerUnit: 0.001,
        userGrowthRate: 0.05,
        usageGrowthRate: 0.02,
        nested: { deep: true },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("Revenue stream update schema", () => {
  it("accepts partial updates (name only)", () => {
    const result = updateSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts partial updates (type only)", () => {
    const result = updateSchema.safeParse({ type: "services" });
    expect(result.success).toBe(true);
  });

  it("accepts partial updates (parameters only)", () => {
    const result = updateSchema.safeParse({
      parameters: { monthlyPrice: 99 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no-op update)", () => {
    const result = updateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid type in update", () => {
    const result = updateSchema.safeParse({ type: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name in update", () => {
    const result = updateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
