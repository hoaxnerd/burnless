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

  it("treats missing employeeType as full_time (defensive default)", () => {
    // Regression: legacy scenario-override JSONB rows (created before the
    // create-schema's `employeeType.default("full_time")` landed) resolve
    // without employeeType. The dashboard crashed with
    // "Cannot read properties of undefined (reading 'mul')" because the switch
    // fell through and returned undefined. monthlySalaryFor now mirrors the DB
    // column default.
    const r = computeHeadcountPlanCost(
      {
        id: "legacy",
        departmentId: "d",
        title: "Office Manager",
        // @ts-expect-error — simulating legacy override data
        employeeType: undefined,
        count: 2,
        salary: 110000,
        hourlyRate: null,
        hoursPerWeek: null,
        startDate: new Date(2026, 4, 1),
        endDate: null,
        benefitsRate: 0,
      },
      new Date(2026, 4, 1),
      new Date(2026, 5, 1),
    );
    // 2 FTE × 110_000 / 12 = 18_333.33
    expect(r.salary.get("2026-05")).toBeCloseTo(18333.33, 2);
  });
});
