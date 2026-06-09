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

export type BenefitsComponentKey =
  | "statutoryEmployerContributionsCost"
  | "insuranceBenefitsCost"
  | "retirementContributionsCost"
  | "otherBenefitsCost";

export const BENEFITS_COMPONENT_KEYS: BenefitsComponentKey[] = [
  "statutoryEmployerContributionsCost",
  "insuranceBenefitsCost",
  "retirementContributionsCost",
  "otherBenefitsCost",
];

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
  /**
   * Benefits decomposed by the four generic components (umbrella §1.4).
   * Components only sum to `benefitsCost` for plans that supply
   * `benefitsBreakdown`; legacy `benefitsRate`-only plans contribute zeros
   * across all four components and the total via the flat rate path.
   */
  benefitsByComponent: Map<BenefitsComponentKey, MonthlySeries>;
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

/**
 * Reconcile headcount-plan cost with personnel ACTUALS to prevent double-counting.
 *
 * When a company books real payroll to a `coversHeadcount` financial account AND
 * maintains a headcount plan, both would otherwise be summed into expenses. This
 * returns a copy of the plan cost with the value zeroed in every month that has
 * personnel actuals — so closed months use actuals and forecast months use the
 * plan, and personnel is counted exactly once. A no-op when the set is empty
 * (headcount-plan-only companies are unaffected).
 */
export function reconcileHeadcountWithActuals(
  headcountCost: MonthlySeries,
  personnelActualMonths: Set<string>,
): MonthlySeries {
  const out: MonthlySeries = new Map(headcountCost);
  for (const month of personnelActualMonths) {
    if (out.has(month)) out.set(month, 0);
  }
  return out;
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
  // Defensive default: legacy scenario-override JSONB rows (created before the
  // create-schema's `employeeType.default("full_time")` landed) can resolve
  // without an employeeType. Mirror the DB column default rather than
  // falling through and returning undefined.
  const type: HeadcountEmployeeType = plan.employeeType ?? "full_time";
  switch (type) {
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

/**
 * WILD-02: full-loaded monthly cost for a single headcount plan entry, at the
 * plan's base salary (no proration, no salary changes, no bonuses).
 *
 * = monthlySalaryFor(plan, salary) × count × (1 + effective benefits rate)
 *
 * Honors employeeType:
 *   - full_time:  annualSalary / 12
 *   - part_time:  (annualSalary / 12) × hoursPerWeek / 40   (default 40 hpw)
 *   - contractor: hoursPerWeek × 4.33 weeks/mo × hourlyRate
 *
 * Effective benefits = sum(benefitsBreakdown) when present, else flat benefitsRate.
 * Returns a 2-decimal number.
 */
export function computeMemberMonthlyCost(plan: HeadcountPlanInput): number {
  const perMember = monthlySalaryFor(plan, plan.salary);
  const benefitsMultiplier = D(1).plus(effectiveBenefitsRate(plan));
  return dRound2(perMember.mul(plan.count).mul(benefitsMultiplier));
}

/** Calculate monthly cost for a single headcount plan entry. */
export function computeHeadcountPlanCost(
  plan: HeadcountPlanInput,
  periodStart: Date,
  periodEnd: Date
): {
  salary: MonthlySeries;
  benefits: MonthlySeries;
  bonus: MonthlySeries;
  headcount: MonthlySeries;
  benefitsByComponent: Map<BenefitsComponentKey, MonthlySeries>;
} {
  const months = monthRange(periodStart, periodEnd);
  const salary: MonthlySeries = new Map();
  const benefits: MonthlySeries = new Map();
  const bonus: MonthlySeries = new Map();
  const headcount: MonthlySeries = new Map();
  const benefitsByComponent = new Map<BenefitsComponentKey, MonthlySeries>();
  for (const k of BENEFITS_COMPONENT_KEYS) benefitsByComponent.set(k, new Map());

  // Use cumulative rounding to prevent penny drift over the year.
  // Each month gets the difference between cumulative rounded targets,
  // ensuring the annual total is exact.
  let cumulativeExactSalary = D(0);
  let cumulativeRoundedSalary = D(0);
  let cumulativeExactBenefits = D(0);
  let cumulativeRoundedBenefits = D(0);

  // Per-component cumulative trackers (only populated when benefitsBreakdown is present).
  const cumulativeExactByComponent = new Map<BenefitsComponentKey, ReturnType<typeof D>>();
  const cumulativeRoundedByComponent = new Map<BenefitsComponentKey, ReturnType<typeof D>>();
  for (const k of BENEFITS_COMPONENT_KEYS) {
    cumulativeExactByComponent.set(k, D(0));
    cumulativeRoundedByComponent.set(k, D(0));
  }
  const breakdown = plan.benefitsBreakdown;

  for (const month of months) {
    const key = monthKey(month);

    // Bonuses are independent of activity gates — they emit in the configured payoutMonth.
    const bonusAmount = round2(emitBonuses(plan.bonuses ?? [], month));

    if (!isActiveInMonth(month, plan.startDate, plan.endDate)) {
      salary.set(key, 0);
      benefits.set(key, 0);
      bonus.set(key, bonusAmount);
      headcount.set(key, 0);
      for (const k of BENEFITS_COMPONENT_KEYS) {
        benefitsByComponent.get(k)!.set(key, 0);
      }
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

    // Per-component breakdown — only populated when an explicit breakdown is set.
    for (const k of BENEFITS_COMPONENT_KEYS) {
      const fraction = breakdown ? (breakdown[k] ?? 0) : 0;
      const exactPrev = cumulativeExactByComponent.get(k)!;
      const exactNext = exactPrev.plus(monthlySalary.mul(plan.count).mul(proration).mul(fraction));
      cumulativeExactByComponent.set(k, exactNext);
      const newRounded = dRound2(exactNext);
      const amount = dRound2(D(newRounded).minus(cumulativeRoundedByComponent.get(k)!));
      cumulativeRoundedByComponent.set(k, D(newRounded));
      benefitsByComponent.get(k)!.set(key, amount);
    }
  }

  return { salary, benefits, bonus, headcount, benefitsByComponent };
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
  const totalBenefitsByComponent = new Map<BenefitsComponentKey, MonthlySeries>();
  for (const k of BENEFITS_COMPONENT_KEYS) totalBenefitsByComponent.set(k, new Map());

  for (const plan of plans) {
    const { salary, benefits, bonus, headcount, benefitsByComponent } =
      computeHeadcountPlanCost(plan, periodStart, periodEnd);

    totalSalary = addSeries(totalSalary, salary);
    totalBenefits = addSeries(totalBenefits, benefits);
    totalBonus = addSeries(totalBonus, bonus);
    totalHeadcount = addSeries(totalHeadcount, headcount);

    for (const k of BENEFITS_COMPONENT_KEYS) {
      const acc = totalBenefitsByComponent.get(k)!;
      totalBenefitsByComponent.set(k, addSeries(acc, benefitsByComponent.get(k)!));
    }

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
    benefitsByComponent: totalBenefitsByComponent,
  };
}

// ── Equity grant vesting ────────────────────────────────────────────────────

export type VestingMilestone = {
  type: "cliff" | "monthly" | "quarterly" | "annual" | "milestone";
  date: Date;
  sharesVested: number;
};

export interface EquityGrantInput {
  id: string;
  headcountId: string;
  grantDate: Date;
  shares: number;
  vestingSchedule: VestingMilestone[];
}

/** Cumulative-shares-vested time series for a single equity grant.
 *
 *  For each month in [periodStart, periodEnd], returns the cumulative number
 *  of shares vested as of that month-end. Milestones are summed in date order
 *  with no proration — a milestone vests fully on/after its date. */
export function computeVestedSharesSeries(
  grant: EquityGrantInput,
  periodStart: Date,
  periodEnd: Date,
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
  const series: MonthlySeries = new Map();
  const sorted = [...grant.vestingSchedule].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  for (const m of months) {
    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const cumulative = sorted
      .filter((v) => v.date <= monthEnd)
      .reduce((s, v) => s + v.sharesVested, 0);
    series.set(monthKey(m), cumulative);
  }
  return series;
}
