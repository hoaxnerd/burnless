import { describe, expect, it } from "vitest";
import { computeHeadcountPlanCost } from "../headcount";

describe("benefits breakdown sums", () => {
  it("benefitsBreakdown overrides flat benefitsRate", () => {
    const r = computeHeadcountPlanCost(
      {
        id: "1",
        departmentId: "d",
        title: "Eng",
        employeeType: "full_time",
        count: 1,
        salary: 120000,
        hourlyRate: null,
        hoursPerWeek: null,
        startDate: new Date(2026, 0, 1),
        endDate: null,
        benefitsRate: 0.20,
        benefitsBreakdown: {
          statutoryEmployerContributionsCost: 0.0765,
          insuranceBenefitsCost: 0.05,
          retirementContributionsCost: 0.04,
          otherBenefitsCost: 0.01,
        },
      },
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
    );
    expect(r.benefits.get("2026-01")).toBeCloseTo(10000 * 0.1765, 2);
  });

  it("falls back to flat benefitsRate when breakdown is absent", () => {
    const r = computeHeadcountPlanCost(
      {
        id: "2",
        departmentId: "d",
        title: "Eng",
        employeeType: "full_time",
        count: 1,
        salary: 120000,
        hourlyRate: null,
        hoursPerWeek: null,
        startDate: new Date(2026, 0, 1),
        endDate: null,
        benefitsRate: 0.20,
      },
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
    );
    expect(r.benefits.get("2026-01")).toBeCloseTo(2000, 2);
  });
});
