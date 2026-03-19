import { describe, it, expect } from "vitest";
import { computeAllHeadcountCosts, type HeadcountPlanInput } from "../headcount";

describe("headcount", () => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 5, 1);

  it("calculates monthly salary and benefits", () => {
    const plans: HeadcountPlanInput[] = [
      {
        id: "h1",
        departmentId: "eng",
        title: "Senior Engineer",
        count: 2,
        salary: 120000, // $120k annual
        startDate: start,
        endDate: null,
        benefitsRate: 0.20,
      },
    ];

    const result = computeAllHeadcountCosts(plans, start, end);

    // Monthly salary: 120000/12 * 2 = 20000
    // Benefits: 20000 * 0.20 = 4000
    // Total: 24000
    expect(result.salaryCost.get("2026-01")).toBe(20000);
    expect(result.benefitsCost.get("2026-01")).toBe(4000);
    expect(result.totalCost.get("2026-01")).toBe(24000);
    expect(result.headcount.get("2026-01")).toBe(2);
  });

  it("handles mid-year hires", () => {
    const plans: HeadcountPlanInput[] = [
      {
        id: "h1",
        departmentId: "eng",
        title: "Engineer",
        count: 1,
        salary: 120000,
        startDate: new Date(2026, 2, 1), // Mar 1
        endDate: null,
        benefitsRate: 0.20,
      },
    ];

    const result = computeAllHeadcountCosts(plans, start, end);
    expect(result.totalCost.get("2026-01")).toBe(0); // before start
    expect(result.totalCost.get("2026-02")).toBe(0); // before start
    expect(result.totalCost.get("2026-03")).toBe(12000); // 10000 + 2000 benefits
  });

  it("aggregates by department", () => {
    const plans: HeadcountPlanInput[] = [
      { id: "h1", departmentId: "eng", title: "Eng 1", count: 1, salary: 120000, startDate: start, endDate: null, benefitsRate: 0.20 },
      { id: "h2", departmentId: "eng", title: "Eng 2", count: 1, salary: 96000, startDate: start, endDate: null, benefitsRate: 0.20 },
      { id: "h3", departmentId: "sales", title: "AE", count: 1, salary: 80000, startDate: start, endDate: null, benefitsRate: 0.20 },
    ];

    const result = computeAllHeadcountCosts(plans, start, end);
    // Eng: (10000 + 8000) * 1.2 = 21600
    expect(result.byDepartment.get("eng")!.get("2026-01")).toBe(21600);
    // Sales: 80000/12 * 1.2 ≈ 8000
    const salesCost = result.byDepartment.get("sales")!.get("2026-01")!;
    expect(salesCost).toBeCloseTo(8000, 0);
    expect(result.headcount.get("2026-01")).toBe(3);
  });
});
