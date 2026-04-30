/**
 * Schema-level tests for the Phase-1 team AI tools.
 *
 * These tests pin down the Zod-validated boundary between the AI provider's
 * tool call and the handler — they do NOT exercise the database. Handler-level
 * persistence tests (deep-merge, scenario routing) live in the @burnless/db
 * suite, which has PGLite set up; the tool handlers delegate to those query
 * modules via thin wrappers.
 */

import { describe, expect, it } from "vitest";
import {
  addHeadcountSchema,
  updateHeadcountSchema,
} from "../headcount";

describe("addHeadcountSchema", () => {
  it("accepts new Phase-1 fields (employeeType, hourlyRate, hoursPerWeek, fractional count)", () => {
    const result = addHeadcountSchema.safeParse({
      departmentId: "dept-1",
      title: "Senior Engineer",
      name: "Alice Smith",
      employeeType: "part_time",
      count: 0.5,
      salary: 120000,
      hourlyRate: 60,
      hoursPerWeek: 20,
      startDate: "2026-04-01",
      parameters: {
        benefitsBreakdown: {
          insuranceBenefitsCost: 0.1,
          retirementContributionsCost: 0.05,
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employeeType).toBe("part_time");
      expect(result.data.count).toBe(0.5);
      expect(result.data.parameters?.benefitsBreakdown?.insuranceBenefitsCost).toBe(0.1);
    }
  });

  it("defaults count to 1 when omitted", () => {
    const result = addHeadcountSchema.parse({
      departmentId: "dept-1",
      title: "Engineer",
      salary: 100000,
      startDate: "2026-04-01",
    });
    expect(result.count).toBe(1);
  });
});

describe("updateHeadcountSchema", () => {
  it("accepts employeeType: part_time + hoursPerWeek: 20", () => {
    const result = updateHeadcountSchema.safeParse({
      id: "hc-1",
      employeeType: "part_time",
      hoursPerWeek: 20,
    });
    expect(result.success).toBe(true);
  });

  it("accepts fractional count (0.5)", () => {
    const result = updateHeadcountSchema.safeParse({ id: "hc-1", count: 0.5 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.count).toBe(0.5);
  });

  it("rejects count > 99.99", () => {
    const result = updateHeadcountSchema.safeParse({ id: "hc-1", count: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown employeeType", () => {
    const result = updateHeadcountSchema.safeParse({
      id: "hc-1",
      employeeType: "intern",
    });
    expect(result.success).toBe(false);
  });

  it("accepts parameters.benefitsBreakdown partial update", () => {
    const result = updateHeadcountSchema.safeParse({
      id: "hc-1",
      parameters: { benefitsBreakdown: { insuranceBenefitsCost: 0.08 } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parameters?.benefitsBreakdown?.insuranceBenefitsCost).toBe(0.08);
    }
  });

  it("rejects benefitsBreakdown fractions > 1", () => {
    const result = updateHeadcountSchema.safeParse({
      id: "hc-1",
      parameters: { benefitsBreakdown: { insuranceBenefitsCost: 1.5 } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts hourlyRate: null (clearing the value)", () => {
    const result = updateHeadcountSchema.safeParse({ id: "hc-1", hourlyRate: null });
    expect(result.success).toBe(true);
  });
});
