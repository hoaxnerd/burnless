import { describe, expect, it } from "vitest";
import { generateProfitAndLoss } from "../statements";
import {
  computeAllHeadcountCosts,
  type HeadcountPlanInput,
} from "../headcount";
import type { MonthlySeries } from "../utils";

describe("P&L benefits breakdown", () => {
  it("emits a Benefits sub-line with 4 children when personnelBreakdown is provided", () => {
    const breakdown = new Map<string, MonthlySeries>([
      ["statutoryEmployerContributionsCost", new Map([["2026-01", 765]])],
      ["insuranceBenefitsCost", new Map([["2026-01", 500]])],
      ["retirementContributionsCost", new Map([["2026-01", 400]])],
      ["otherBenefitsCost", new Map([["2026-01", 100]])],
    ]);
    const pnl = generateProfitAndLoss([], {
      personnelBreakdown: { benefitsByComponent: breakdown },
    });
    const opexChildren = pnl.operatingExpenses.children ?? [];
    const benefits = opexChildren.find((c) => c.name === "Benefits");
    expect(benefits).toBeDefined();
    expect(benefits!.children).toHaveLength(4);
    expect(benefits!.values[0]?.value).toBe(1765);
    const childSum = benefits!.children!.reduce(
      (s, c) => s + (c.values[0]?.value ?? 0),
      0,
    );
    expect(childSum).toBe(1765);
  });

  it("emits no Benefits sub-line when no breakdown is provided (back-compat)", () => {
    const pnl = generateProfitAndLoss([]);
    const opexChildren = pnl.operatingExpenses.children ?? [];
    expect(opexChildren.find((c) => c.name === "Benefits")).toBeUndefined();
  });

  it("computeAllHeadcountCosts: components sum to benefitsCost when breakdown is set", () => {
    const plan: HeadcountPlanInput = {
      id: "p1",
      departmentId: "eng",
      title: "Engineer",
      employeeType: "full_time",
      count: 1,
      salary: 120_000,
      hourlyRate: null,
      hoursPerWeek: null,
      startDate: new Date("2026-01-01"),
      endDate: null,
      benefitsRate: 0.3,
      benefitsBreakdown: {
        statutoryEmployerContributionsCost: 0.0765,
        insuranceBenefitsCost: 0.05,
        retirementContributionsCost: 0.04,
        otherBenefitsCost: 0.01,
      },
    };
    const result = computeAllHeadcountCosts(
      [plan],
      new Date("2026-01-01"),
      new Date("2026-03-31"),
    );

    const months = ["2026-01", "2026-02", "2026-03"];
    for (const m of months) {
      const total = result.benefitsCost.get(m) ?? 0;
      let sum = 0;
      for (const [, series] of result.benefitsByComponent) {
        sum += series.get(m) ?? 0;
      }
      // Penny-tolerance: cumulative-rounded series can differ by < 1c.
      expect(Math.abs(sum - total)).toBeLessThan(0.02);
    }
  });

  it("computeAllHeadcountCosts: components are zero when only flat benefitsRate is set", () => {
    const plan: HeadcountPlanInput = {
      id: "p2",
      departmentId: "eng",
      title: "Engineer",
      employeeType: "full_time",
      count: 1,
      salary: 120_000,
      hourlyRate: null,
      hoursPerWeek: null,
      startDate: new Date("2026-01-01"),
      endDate: null,
      benefitsRate: 0.2,
    };
    const result = computeAllHeadcountCosts(
      [plan],
      new Date("2026-01-01"),
      new Date("2026-02-28"),
    );

    expect((result.benefitsCost.get("2026-01") ?? 0) > 0).toBe(true);
    for (const [, series] of result.benefitsByComponent) {
      expect(series.get("2026-01") ?? 0).toBe(0);
      expect(series.get("2026-02") ?? 0).toBe(0);
    }
  });
});
