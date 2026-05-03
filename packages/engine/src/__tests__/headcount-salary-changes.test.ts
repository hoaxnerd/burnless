import { describe, expect, it } from "vitest";
import { computeHeadcountPlanCost, applySalaryChanges } from "../headcount";

describe("salary-change step function", () => {
  it("applies a single change starting in April", () => {
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
        benefitsRate: 0,
        salaryChanges: [
          { effectiveDate: new Date(2026, 3, 1), newSalary: 144000 },
        ],
      },
      new Date(2026, 0, 1),
      new Date(2026, 11, 1),
    );
    expect(r.salary.get("2026-03")).toBeCloseTo(10000, 2);
    expect(r.salary.get("2026-04")).toBeCloseTo(12000, 2);
    expect(r.salary.get("2026-12")).toBeCloseTo(12000, 2);
  });

  it("multiple changes apply in date order", () => {
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
        benefitsRate: 0,
        salaryChanges: [
          { effectiveDate: new Date(2026, 6, 1), newSalary: 180000 },
          { effectiveDate: new Date(2026, 3, 1), newSalary: 144000 },
        ],
      },
      new Date(2026, 0, 1),
      new Date(2026, 11, 1),
    );
    expect(r.salary.get("2026-03")).toBeCloseTo(10000, 2);
    expect(r.salary.get("2026-04")).toBeCloseTo(12000, 2);
    expect(r.salary.get("2026-07")).toBeCloseTo(15000, 2);
  });

  it("applySalaryChanges returns base when no changes", () => {
    expect(applySalaryChanges(100000, [], new Date(2026, 5, 1))).toBe(100000);
  });
});
