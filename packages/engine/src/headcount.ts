/**
 * Headcount planning engine — calculates monthly personnel costs from hiring plans.
 *
 * Handles:
 * - Salary proration for mid-month starts/ends
 * - Benefits as percentage of salary
 * - Aggregation by department
 * - Total headcount over time
 */

import type { HeadcountPlan, Department } from "@burnless/types";
import {
  type MonthlySeries,
  monthRange,
  monthKey,
  round2,
  isActiveInMonth,
  proratedFraction,
  addSeries,
} from "./utils";
import { D, dRound2 } from "./decimal";

// ── Headcount calculation results ────────────────────────────────────────────

export interface HeadcountCostBreakdown {
  /** Total personnel cost per month (salary + benefits + bonus) */
  totalCost: MonthlySeries;
  /** Salary-only cost per month */
  salaryCost: MonthlySeries;
  /** Benefits-only cost per month */
  benefitsCost: MonthlySeries;
  /** Bonus-only cost per month (paid in the bonus's payoutMonth) */
  bonusCost: MonthlySeries;
  /** Total headcount per month */
  headcount: MonthlySeries;
  /** Cost by department: dept ID -> monthly series */
  byDepartment: Map<string, MonthlySeries>;
  /** Headcount by department: dept ID -> monthly series */
  headcountByDepartment: Map<string, MonthlySeries>;
}

export type HeadcountEmployeeType = "full_time" | "part_time" | "contractor";

export interface HeadcountPlanInput {
  id: string;
  departmentId: string;
  title: string;
  name?: string | null;
  employeeType: HeadcountEmployeeType;
  count: number;
  salary: number; // annual
  hourlyRate: number | null;
  hoursPerWeek: number | null;
  startDate: Date;
  endDate: Date | null;
  benefitsRate: number; // e.g. 0.20 = 20%
  benefitsBreakdown?: Partial<{
    statutoryEmployerContributionsCost: number;
    insuranceBenefitsCost: number;
    retirementContributionsCost: number;
    otherBenefitsCost: number;
  }>;
  salaryChanges?: SalaryChange[];
  bonuses?: BonusInput[];
}

export interface SalaryChange {
  effectiveDate: Date;
  newSalary: number; // annual
}

export interface BonusInput {
  payoutMonth: Date;
  amount: number;
}

/** Sum any bonus amounts whose payoutMonth falls in the given month. */
export function emitBonuses(bonuses: BonusInput[], month: Date): number {
  const target = monthKey(month);
  return bonuses
    .filter((b) => monthKey(b.payoutMonth) === target)
    .reduce((sum, b) => sum + b.amount, 0);
}

/** Resolve the active annual salary for a given month, applying any salary changes whose effective date is on or before the month-end. */
export function applySalaryChanges(
  baseSalary: number,
  changes: SalaryChange[],
  month: Date,
): number {
  const sorted = [...changes].sort(
    (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
  );
  let salary = baseSalary;
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  for (const c of sorted) {
    if (c.effectiveDate <= monthEnd) salary = c.newSalary;
    else break;
  }
  return salary;
}

// ── Core headcount functions ─────────────────────────────────────────────────

const FULL_TIME_BASELINE_HPW = 40;
const WEEKS_PER_MONTH = 4.33;

/** Resolve the effective benefits rate. Sum benefitsBreakdown if present, else fall back to flat benefitsRate. */
function effectiveBenefitsRate(plan: HeadcountPlanInput): number {
  const b = plan.benefitsBreakdown;
  if (b) {
    return (
      (b.statutoryEmployerContributionsCost ?? 0) +
      (b.insuranceBenefitsCost ?? 0) +
      (b.retirementContributionsCost ?? 0) +
      (b.otherBenefitsCost ?? 0)
    );
  }
  return plan.benefitsRate ?? 0;
}

/** Compute the per-month salary cost for a single FTE on this plan, given a resolved annual salary. */
function monthlySalaryFor(plan: HeadcountPlanInput, resolvedAnnualSalary: number) {
  switch (plan.employeeType) {
    case "full_time":
      return D(resolvedAnnualSalary).div(12);
    case "part_time": {
      const hpw = plan.hoursPerWeek ?? FULL_TIME_BASELINE_HPW;
      return D(resolvedAnnualSalary).div(12).mul(hpw).div(FULL_TIME_BASELINE_HPW);
    }
    case "contractor": {
      const rate = plan.hourlyRate ?? 0;
      const hpw = plan.hoursPerWeek ?? 0;
      return D(hpw).mul(WEEKS_PER_MONTH).mul(rate);
    }
  }
}

/** Calculate monthly cost for a single headcount plan entry. */
export function computeHeadcountPlanCost(
  plan: HeadcountPlanInput,
  periodStart: Date,
  periodEnd: Date
): { salary: MonthlySeries; benefits: MonthlySeries; bonus: MonthlySeries; headcount: MonthlySeries } {
  const months = monthRange(periodStart, periodEnd);
  const salary: MonthlySeries = new Map();
  const benefits: MonthlySeries = new Map();
  const bonus: MonthlySeries = new Map();
  const headcount: MonthlySeries = new Map();

  // Use cumulative rounding to prevent penny drift over the year.
  // Each month gets the difference between cumulative rounded targets,
  // ensuring the annual total is exact.
  let cumulativeExactSalary = D(0);
  let cumulativeRoundedSalary = D(0);
  let cumulativeExactBenefits = D(0);
  let cumulativeRoundedBenefits = D(0);

  for (const month of months) {
    const key = monthKey(month);

    // Bonuses are independent of activity gates — they emit in the configured payoutMonth.
    const bonusAmount = round2(emitBonuses(plan.bonuses ?? [], month));

    if (!isActiveInMonth(month, plan.startDate, plan.endDate)) {
      salary.set(key, 0);
      benefits.set(key, 0);
      bonus.set(key, bonusAmount);
      headcount.set(key, 0);
      continue;
    }

    const proration = proratedFraction(month, plan.startDate, plan.endDate);

    const resolvedSalary = applySalaryChanges(plan.salary, plan.salaryChanges ?? [], month);
    const monthlySalary = monthlySalaryFor(plan, resolvedSalary);

    cumulativeExactSalary = cumulativeExactSalary.plus(monthlySalary.mul(plan.count).mul(proration));
    const newRoundedSalary = dRound2(cumulativeExactSalary);
    const salaryAmount = dRound2(D(newRoundedSalary).minus(cumulativeRoundedSalary));
    cumulativeRoundedSalary = D(newRoundedSalary);

    cumulativeExactBenefits = cumulativeExactBenefits.plus(monthlySalary.mul(plan.count).mul(proration).mul(effectiveBenefitsRate(plan)));
    const newRoundedBenefits = dRound2(cumulativeExactBenefits);
    const benefitsAmount = dRound2(D(newRoundedBenefits).minus(cumulativeRoundedBenefits));
    cumulativeRoundedBenefits = D(newRoundedBenefits);

    salary.set(key, salaryAmount);
    benefits.set(key, benefitsAmount);
    bonus.set(key, bonusAmount);
    headcount.set(key, dRound2(D(plan.count).mul(proration)));
  }

  return { salary, benefits, bonus, headcount };
}

/** Calculate total headcount costs across all plans. */
export function computeAllHeadcountCosts(
  plans: HeadcountPlanInput[],
  periodStart: Date,
  periodEnd: Date
): HeadcountCostBreakdown {
  let totalSalary: MonthlySeries = new Map();
  let totalBenefits: MonthlySeries = new Map();
  let totalBonus: MonthlySeries = new Map();
  let totalHeadcount: MonthlySeries = new Map();
  const byDepartment = new Map<string, MonthlySeries>();
  const headcountByDepartment = new Map<string, MonthlySeries>();

  for (const plan of plans) {
    const { salary, benefits, bonus, headcount } = computeHeadcountPlanCost(
      plan,
      periodStart,
      periodEnd
    );

    totalSalary = addSeries(totalSalary, salary);
    totalBenefits = addSeries(totalBenefits, benefits);
    totalBonus = addSeries(totalBonus, bonus);
    totalHeadcount = addSeries(totalHeadcount, headcount);

    // Aggregate by department (salary + benefits + bonus)
    const deptTotal = addSeries(addSeries(salary, benefits), bonus);
    const existing = byDepartment.get(plan.departmentId);
    if (existing) {
      byDepartment.set(plan.departmentId, addSeries(existing, deptTotal));
    } else {
      byDepartment.set(plan.departmentId, deptTotal);
    }

    const existingHc = headcountByDepartment.get(plan.departmentId);
    if (existingHc) {
      headcountByDepartment.set(plan.departmentId, addSeries(existingHc, headcount));
    } else {
      headcountByDepartment.set(plan.departmentId, new Map(headcount));
    }
  }

  return {
    totalCost: addSeries(addSeries(totalSalary, totalBenefits), totalBonus),
    salaryCost: totalSalary,
    benefitsCost: totalBenefits,
    bonusCost: totalBonus,
    headcount: totalHeadcount,
    byDepartment,
    headcountByDepartment,
  };
}
