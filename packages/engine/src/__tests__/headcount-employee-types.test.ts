import { describe, expect, it } from "vitest";
import { computeHeadcountPlanCost } from "../headcount";

describe("employee-type-aware cost", () => {
  it("full_time uses salary/12 (existing behavior)", () => {
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
      },
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
    );
    expect(r.salary.get("2026-01")).toBeCloseTo(10000, 2);
  });

  it("part_time prorates by hoursPerWeek/40", () => {
    const r = computeHeadcountPlanCost(
      {
        id: "2",
        departmentId: "d",
        title: "Eng",
        employeeType: "part_time",
        count: 1,
        salary: 120000,
        hourlyRate: null,
        hoursPerWeek: 20,
        startDate: new Date(2026, 0, 1),
        endDate: null,
        benefitsRate: 0,
      },
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
    );
    expect(r.salary.get("2026-01")).toBeCloseTo(5000, 2);
  });

  it("contractor = hoursPerWeek × 4.33 × hourlyRate", () => {
    const r = computeHeadcountPlanCost(
      {
        id: "3",
        departmentId: "d",
        title: "Eng",
        employeeType: "contractor",
        count: 1,
        salary: 0,
        hourlyRate: 100,
        hoursPerWeek: 40,
        startDate: new Date(2026, 0, 1),
        endDate: null,
        benefitsRate: 0,
      },
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
    );
    expect(r.salary.get("2026-01")).toBeCloseTo(40 * 4.33 * 100, 2);
  });

  it("contractor with count=0.5 halves the result", () => {
    const r = computeHeadcountPlanCost(
      {
        id: "4",
        departmentId: "d",
        title: "Eng",
        employeeType: "contractor",
        count: 0.5,
        salary: 0,
        hourlyRate: 100,
        hoursPerWeek: 40,
        startDate: new Date(2026, 0, 1),
        endDate: null,
        benefitsRate: 0,
      },
      new Date(2026, 0, 1),
      new Date(2026, 1, 1),
    );
    expect(r.salary.get("2026-01")).toBeCloseTo(40 * 4.33 * 100 * 0.5, 2);
  });
});
