import { describe, expect, it } from "vitest";
import {
  computeHeadcountPlanCost,
  computeAllHeadcountCosts,
  emitBonuses,
  type HeadcountPlanInput,
} from "../headcount";

const basePlan = (overrides: Partial<HeadcountPlanInput>): HeadcountPlanInput => ({
  id: "1",
  departmentId: "eng",
  title: "Eng",
  employeeType: "full_time",
  count: 1,
  salary: 120000,
  hourlyRate: null,
  hoursPerWeek: null,
  startDate: new Date(2026, 0, 1),
  endDate: null,
  benefitsRate: 0,
  ...overrides,
});

describe("bonus emission", () => {
  it("single bonus emits in payoutMonth, zero in others", () => {
    const r = computeHeadcountPlanCost(
      basePlan({
        bonuses: [{ payoutMonth: new Date(2026, 2, 15), amount: 5000 }],
      }),
      new Date(2026, 0, 1),
      new Date(2026, 5, 1),
    );
    expect(r.bonus.get("2026-01")).toBe(0);
    expect(r.bonus.get("2026-02")).toBe(0);
    expect(r.bonus.get("2026-03")).toBe(5000);
    expect(r.bonus.get("2026-04")).toBe(0);
    expect(r.bonus.get("2026-05")).toBe(0);
  });

  it("multiple bonuses in same month sum together", () => {
    const r = computeHeadcountPlanCost(
      basePlan({
        bonuses: [
          { payoutMonth: new Date(2026, 1, 1), amount: 2000 },
          { payoutMonth: new Date(2026, 1, 20), amount: 3000 },
        ],
      }),
      new Date(2026, 0, 1),
      new Date(2026, 2, 1),
    );
    expect(r.bonus.get("2026-02")).toBe(5000);
  });

  it("bonuses outside the period don't appear in the series", () => {
    const r = computeHeadcountPlanCost(
      basePlan({
        bonuses: [
          { payoutMonth: new Date(2025, 5, 1), amount: 9999 },
          { payoutMonth: new Date(2027, 0, 1), amount: 7777 },
        ],
      }),
      new Date(2026, 0, 1),
      new Date(2026, 5, 1),
    );
    for (const v of r.bonus.values()) {
      expect(v).toBe(0);
    }
  });

  it("totalCost includes bonus contribution in computeAllHeadcountCosts", () => {
    const result = computeAllHeadcountCosts(
      [
        basePlan({
          benefitsRate: 0.20,
          bonuses: [{ payoutMonth: new Date(2026, 2, 1), amount: 5000 }],
        }),
      ],
      new Date(2026, 0, 1),
      new Date(2026, 5, 1),
    );
    // March: salary 10000 + benefits 2000 + bonus 5000 = 17000
    expect(result.bonusCost.get("2026-03")).toBe(5000);
    expect(result.totalCost.get("2026-03")).toBeCloseTo(17000, 2);
    // February: salary 10000 + benefits 2000 + bonus 0 = 12000
    expect(result.totalCost.get("2026-02")).toBeCloseTo(12000, 2);
    // byDepartment includes bonus
    expect(result.byDepartment.get("eng")!.get("2026-03")).toBeCloseTo(17000, 2);
  });

  it("emitBonuses returns 0 when none match", () => {
    expect(
      emitBonuses(
        [{ payoutMonth: new Date(2026, 0, 1), amount: 100 }],
        new Date(2026, 5, 1),
      ),
    ).toBe(0);
  });
});
