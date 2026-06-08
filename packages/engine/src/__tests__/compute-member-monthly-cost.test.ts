/**
 * WILD-02: computeMemberMonthlyCost — full-loaded monthly cost for one plan entry,
 * at the plan's base salary (no proration / salary changes / bonuses), honoring
 * all three employeeType paths and the effective benefits rate.
 */

import { describe, it, expect } from "vitest";
import { computeMemberMonthlyCost, type HeadcountPlanInput } from "../headcount";

function basePlan(overrides: Partial<HeadcountPlanInput>): HeadcountPlanInput {
  return {
    id: "p1",
    departmentId: "d1",
    title: "Engineer",
    employeeType: "full_time",
    count: 1,
    salary: 0,
    hourlyRate: null,
    hoursPerWeek: null,
    startDate: new Date("2026-01-01"),
    endDate: null,
    benefitsRate: 0,
    ...overrides,
  };
}

describe("computeMemberMonthlyCost (WILD-02)", () => {
  it("full_time: annualSalary / 12 × count × (1 + benefits)", () => {
    // 120000 / 12 = 10000/mo; × 2 people × 1.20 benefits = 24000
    const plan = basePlan({
      employeeType: "full_time",
      salary: 120000,
      count: 2,
      benefitsRate: 0.2,
    });
    expect(computeMemberMonthlyCost(plan)).toBe(24000);
  });

  it("part_time: prorated by hoursPerWeek / 40", () => {
    // 120000 / 12 = 10000/mo; × 20/40 = 5000; × 1 × 1.10 = 5500
    const plan = basePlan({
      employeeType: "part_time",
      salary: 120000,
      hoursPerWeek: 20,
      count: 1,
      benefitsRate: 0.1,
    });
    expect(computeMemberMonthlyCost(plan)).toBe(5500);
  });

  it("contractor: hoursPerWeek × 4.33 × hourlyRate (no benefits)", () => {
    // 40 hpw × 4.33 weeks/mo × 50/hr = 8660; × 1 × 1.0 = 8660
    const plan = basePlan({
      employeeType: "contractor",
      hourlyRate: 50,
      hoursPerWeek: 40,
      count: 1,
      benefitsRate: 0,
    });
    expect(computeMemberMonthlyCost(plan)).toBe(8660);
  });

  it("uses benefitsBreakdown sum over flat benefitsRate when present", () => {
    // 60000 / 12 = 5000/mo; breakdown sums to 0.30 → × 1.30 = 6500
    const plan = basePlan({
      employeeType: "full_time",
      salary: 60000,
      count: 1,
      benefitsRate: 0.99, // ignored when breakdown present
      benefitsBreakdown: {
        statutoryEmployerContributionsCost: 0.1,
        insuranceBenefitsCost: 0.1,
        retirementContributionsCost: 0.05,
        otherBenefitsCost: 0.05,
      },
    });
    expect(computeMemberMonthlyCost(plan)).toBe(6500);
  });
});
