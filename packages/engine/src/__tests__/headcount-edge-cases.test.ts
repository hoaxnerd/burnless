import { describe, it, expect } from "vitest";
import {
  computeHeadcountPlanCost,
  computeAllHeadcountCosts,
  type HeadcountPlanInput,
} from "../headcount";

describe("headcount — edge cases", () => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 5, 1);

  it("handles zero salary", () => {
    const plan: HeadcountPlanInput = {
      id: "p1",
      departmentId: "eng",
      title: "Intern",
      count: 1,
      salary: 0,
      startDate: start,
      endDate: null,
      benefitsRate: 0.2,
    };
    const { salary, benefits } = computeHeadcountPlanCost(plan, start, end);
    for (const [, val] of salary) {
      expect(val).toBe(0);
    }
    for (const [, val] of benefits) {
      expect(val).toBe(0);
    }
  });

  it("handles zero benefits rate", () => {
    const plan: HeadcountPlanInput = {
      id: "p1",
      departmentId: "eng",
      title: "Contractor",
      count: 1,
      salary: 120000,
      startDate: start,
      endDate: null,
      benefitsRate: 0,
    };
    const { salary, benefits } = computeHeadcountPlanCost(plan, start, end);
    expect(salary.get("2026-01")).toBe(10000); // 120000/12
    expect(benefits.get("2026-01")).toBe(0);
  });

  it("handles mid-month start date with proration", () => {
    const plan: HeadcountPlanInput = {
      id: "p1",
      departmentId: "eng",
      title: "Engineer",
      count: 1,
      salary: 120000, // $10k/month
      startDate: new Date(2026, 0, 16), // Jan 16
      endDate: null,
      benefitsRate: 0,
    };
    const { salary } = computeHeadcountPlanCost(plan, start, end);
    // Jan has 31 days, active from 16-31 = 16 days
    const janSalary = salary.get("2026-01")!;
    expect(janSalary).toBeCloseTo(10000 * (16 / 31), 0);
    // Feb should be full month
    expect(salary.get("2026-02")).toBe(10000);
  });

  it("handles mid-month end date with proration", () => {
    const plan: HeadcountPlanInput = {
      id: "p1",
      departmentId: "eng",
      title: "Engineer",
      count: 1,
      salary: 120000,
      startDate: start,
      endDate: new Date(2026, 2, 15), // Mar 15
      benefitsRate: 0,
    };
    const { salary } = computeHeadcountPlanCost(plan, start, end);
    // Jan & Feb full
    expect(salary.get("2026-01")).toBe(10000);
    expect(salary.get("2026-02")).toBe(10000);
    // Mar: 15 of 31 days
    const marSalary = salary.get("2026-03")!;
    expect(marSalary).toBeCloseTo(10000 * (15 / 31), 0);
    // Apr onwards: 0
    expect(salary.get("2026-04")).toBe(0);
  });

  it("handles multiple employees (count > 1)", () => {
    const plan: HeadcountPlanInput = {
      id: "p1",
      departmentId: "eng",
      title: "Engineer",
      count: 5,
      salary: 120000,
      startDate: start,
      endDate: null,
      benefitsRate: 0.2,
    };
    const { salary, benefits, headcount } = computeHeadcountPlanCost(plan, start, end);
    // 5 * 10000 = 50000
    expect(salary.get("2026-01")).toBe(50000);
    // Benefits: 50000 * 0.2 = 10000
    expect(benefits.get("2026-01")).toBe(10000);
    expect(headcount.get("2026-01")).toBe(5);
  });

  it("handles employee who starts after period end", () => {
    const plan: HeadcountPlanInput = {
      id: "p1",
      departmentId: "eng",
      title: "Future Hire",
      count: 1,
      salary: 120000,
      startDate: new Date(2027, 0, 1), // after period
      endDate: null,
      benefitsRate: 0.2,
    };
    const { salary } = computeHeadcountPlanCost(plan, start, end);
    for (const [, val] of salary) {
      expect(val).toBe(0);
    }
  });

  it("handles employee who ended before period start", () => {
    const plan: HeadcountPlanInput = {
      id: "p1",
      departmentId: "eng",
      title: "Past Employee",
      count: 1,
      salary: 120000,
      startDate: new Date(2025, 0, 1),
      endDate: new Date(2025, 11, 31),
      benefitsRate: 0.2,
    };
    const { salary } = computeHeadcountPlanCost(plan, start, end);
    for (const [, val] of salary) {
      expect(val).toBe(0);
    }
  });

  describe("computeAllHeadcountCosts", () => {
    it("aggregates multiple plans across departments", () => {
      const plans: HeadcountPlanInput[] = [
        {
          id: "p1",
          departmentId: "eng",
          title: "Engineer",
          count: 3,
          salary: 120000,
          startDate: start,
          endDate: null,
          benefitsRate: 0.2,
        },
        {
          id: "p2",
          departmentId: "sales",
          title: "AE",
          count: 2,
          salary: 96000,
          startDate: start,
          endDate: null,
          benefitsRate: 0.15,
        },
      ];
      const result = computeAllHeadcountCosts(plans, start, end);

      // Eng: 3 * 10000 = 30000 salary, 6000 benefits
      expect(result.byDepartment.get("eng")?.get("2026-01")).toBe(36000);
      // Sales: 2 * 8000 = 16000 salary, 2400 benefits
      expect(result.byDepartment.get("sales")?.get("2026-01")).toBe(18400);

      // Total headcount = 5
      expect(result.headcount.get("2026-01")).toBe(5);
      // Total cost = 36000 + 18400 = 54400
      expect(result.totalCost.get("2026-01")).toBe(54400);
    });

    it("handles empty plans array", () => {
      const result = computeAllHeadcountCosts([], start, end);
      expect(result.totalCost.size).toBe(0);
      expect(result.headcount.size).toBe(0);
      expect(result.byDepartment.size).toBe(0);
    });

    it("handles multiple plans in same department", () => {
      const plans: HeadcountPlanInput[] = [
        {
          id: "p1",
          departmentId: "eng",
          title: "Senior Engineer",
          count: 1,
          salary: 180000,
          startDate: start,
          endDate: null,
          benefitsRate: 0.2,
        },
        {
          id: "p2",
          departmentId: "eng",
          title: "Junior Engineer",
          count: 2,
          salary: 96000,
          startDate: start,
          endDate: null,
          benefitsRate: 0.2,
        },
      ];
      const result = computeAllHeadcountCosts(plans, start, end);
      // Senior: 15000 + 3000 = 18000
      // Junior: 2*8000 + 2*1600 = 19200
      // Total eng: 37200
      expect(result.byDepartment.get("eng")?.get("2026-01")).toBe(37200);
      expect(result.headcountByDepartment.get("eng")?.get("2026-01")).toBe(3);
    });
  });
});
