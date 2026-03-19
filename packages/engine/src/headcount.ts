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

// ── Headcount calculation results ────────────────────────────────────────────

export interface HeadcountCostBreakdown {
  /** Total personnel cost per month (salary + benefits) */
  totalCost: MonthlySeries;
  /** Salary-only cost per month */
  salaryCost: MonthlySeries;
  /** Benefits-only cost per month */
  benefitsCost: MonthlySeries;
  /** Total headcount per month */
  headcount: MonthlySeries;
  /** Cost by department: dept ID -> monthly series */
  byDepartment: Map<string, MonthlySeries>;
  /** Headcount by department: dept ID -> monthly series */
  headcountByDepartment: Map<string, MonthlySeries>;
}

export interface HeadcountPlanInput {
  id: string;
  departmentId: string;
  title: string;
  count: number;
  salary: number; // annual
  startDate: Date;
  endDate: Date | null;
  benefitsRate: number; // e.g. 0.20 = 20%
}

// ── Core headcount functions ─────────────────────────────────────────────────

/** Calculate monthly cost for a single headcount plan entry. */
export function computeHeadcountPlanCost(
  plan: HeadcountPlanInput,
  periodStart: Date,
  periodEnd: Date
): { salary: MonthlySeries; benefits: MonthlySeries; headcount: MonthlySeries } {
  const months = monthRange(periodStart, periodEnd);
  const salary: MonthlySeries = new Map();
  const benefits: MonthlySeries = new Map();
  const headcount: MonthlySeries = new Map();

  const monthlySalary = plan.salary / 12;

  for (const month of months) {
    const key = monthKey(month);

    if (!isActiveInMonth(month, plan.startDate, plan.endDate)) {
      salary.set(key, 0);
      benefits.set(key, 0);
      headcount.set(key, 0);
      continue;
    }

    const proration = proratedFraction(month, plan.startDate, plan.endDate);
    const salaryAmount = round2(monthlySalary * plan.count * proration);
    const benefitsAmount = round2(salaryAmount * plan.benefitsRate);

    salary.set(key, salaryAmount);
    benefits.set(key, benefitsAmount);
    headcount.set(key, round2(plan.count * proration));
  }

  return { salary, benefits, headcount };
}

/** Calculate total headcount costs across all plans. */
export function computeAllHeadcountCosts(
  plans: HeadcountPlanInput[],
  periodStart: Date,
  periodEnd: Date
): HeadcountCostBreakdown {
  let totalSalary: MonthlySeries = new Map();
  let totalBenefits: MonthlySeries = new Map();
  let totalHeadcount: MonthlySeries = new Map();
  const byDepartment = new Map<string, MonthlySeries>();
  const headcountByDepartment = new Map<string, MonthlySeries>();

  for (const plan of plans) {
    const { salary, benefits, headcount } = computeHeadcountPlanCost(
      plan,
      periodStart,
      periodEnd
    );

    totalSalary = addSeries(totalSalary, salary);
    totalBenefits = addSeries(totalBenefits, benefits);
    totalHeadcount = addSeries(totalHeadcount, headcount);

    // Aggregate by department
    const deptTotal = addSeries(salary, benefits);
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
    totalCost: addSeries(totalSalary, totalBenefits),
    salaryCost: totalSalary,
    benefitsCost: totalBenefits,
    headcount: totalHeadcount,
    byDepartment,
    headcountByDepartment,
  };
}
