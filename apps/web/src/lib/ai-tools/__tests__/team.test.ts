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
  addSalaryChangeSchema,
  addBonusSchema,
  addEquityGrantSchema,
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

describe("addSalaryChangeSchema", () => {
  it("accepts a typical raise", () => {
    const result = addSalaryChangeSchema.safeParse({
      headcountId: "hc-1",
      effectiveDate: "2026-07-01",
      newSalary: 135000,
      reason: "annual review",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative newSalary", () => {
    const result = addSalaryChangeSchema.safeParse({
      headcountId: "hc-1",
      effectiveDate: "2026-07-01",
      newSalary: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing effectiveDate", () => {
    const result = addSalaryChangeSchema.safeParse({
      headcountId: "hc-1",
      newSalary: 100000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null reason", () => {
    const result = addSalaryChangeSchema.safeParse({
      headcountId: "hc-1",
      effectiveDate: "2026-07-01",
      newSalary: 100000,
      reason: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("addBonusSchema", () => {
  it("accepts a typical bonus with YYYY-MM payoutMonth", () => {
    const result = addBonusSchema.safeParse({
      headcountId: "hc-1",
      payoutMonth: "2026-12",
      amount: 10000,
      type: "performance",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("performance");
  });

  it("accepts YYYY-MM-DD payoutMonth", () => {
    const result = addBonusSchema.safeParse({
      headcountId: "hc-1",
      payoutMonth: "2026-12-15",
      amount: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative amount", () => {
    const result = addBonusSchema.safeParse({
      headcountId: "hc-1",
      payoutMonth: "2026-12",
      amount: -500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = addBonusSchema.safeParse({
      headcountId: "hc-1",
      payoutMonth: "2026-12",
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed payoutMonth", () => {
    const result = addBonusSchema.safeParse({
      headcountId: "hc-1",
      payoutMonth: "December 2026",
      amount: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("defaults type to performance", () => {
    const result = addBonusSchema.parse({
      headcountId: "hc-1",
      payoutMonth: "2026-06",
      amount: 1000,
    });
    expect(result.type).toBe("performance");
  });

  it("rejects unknown bonus type", () => {
    const result = addBonusSchema.safeParse({
      headcountId: "hc-1",
      payoutMonth: "2026-06",
      amount: 1000,
      type: "spot",
    });
    expect(result.success).toBe(false);
  });
});

describe("addEquityGrantSchema", () => {
  const baseGrant = {
    headcountId: "hc-1",
    grantDate: "2026-01-01",
    shares: 10000,
    grantType: "iso" as const,
  };

  it("accepts a grant with valid vesting schedule", () => {
    const result = addEquityGrantSchema.safeParse({
      ...baseGrant,
      vestingSchedule: [
        { type: "cliff", date: "2027-01-01", sharesVested: 2500 },
        { type: "monthly", date: "2027-02-01", sharesVested: 208.33 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when vesting total exceeds shares granted", () => {
    const result = addEquityGrantSchema.safeParse({
      ...baseGrant,
      shares: 1000,
      vestingSchedule: [
        { type: "cliff", date: "2027-01-01", sharesVested: 600 },
        { type: "annual", date: "2028-01-01", sharesVested: 600 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("Vested shares total");
    }
  });

  it("accepts equal vesting total to shares", () => {
    const result = addEquityGrantSchema.safeParse({
      ...baseGrant,
      shares: 1000,
      vestingSchedule: [{ type: "cliff", date: "2027-01-01", sharesVested: 1000 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive shares", () => {
    const result = addEquityGrantSchema.safeParse({
      ...baseGrant,
      shares: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown grantType", () => {
    const result = addEquityGrantSchema.safeParse({
      ...baseGrant,
      grantType: "phantom",
    });
    expect(result.success).toBe(false);
  });

  it("defaults vestingSchedule to empty array and grantType to iso", () => {
    const result = addEquityGrantSchema.parse({
      headcountId: "hc-1",
      grantDate: "2026-01-01",
      shares: 5000,
    });
    expect(result.vestingSchedule).toEqual([]);
    expect(result.grantType).toBe("iso");
  });

  it("rejects negative sharesVested in milestone", () => {
    const result = addEquityGrantSchema.safeParse({
      ...baseGrant,
      vestingSchedule: [{ type: "cliff", date: "2027-01-01", sharesVested: -100 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts strikePrice: null for RSU", () => {
    const result = addEquityGrantSchema.safeParse({
      ...baseGrant,
      grantType: "rsu",
      strikePrice: null,
    });
    expect(result.success).toBe(true);
  });
});
