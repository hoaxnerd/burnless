/**
 * Revenue modeling engine — generates monthly revenue projections from revenue stream definitions.
 *
 * Supports 4 revenue types:
 * - subscription: recurring SaaS revenue with customer growth and churn
 * - one_time: non-recurring revenue (product sales, setup fees)
 * - usage_based: consumption-based pricing
 * - services: time-based billing (consulting, professional services)
 *
 * All intermediate arithmetic uses Decimal.js for precision.
 */

import {
  type MonthlySeries,
  monthRange,
  monthKey,
  round2,
  addSeries,
} from "./utils";
import { D, dMul, dPow, dRound2 } from "./decimal";

// ── Revenue stream parameter types ───────────────────────────────────────────

export interface SubscriptionParams {
  /** Starting number of customers */
  startingCustomers: number;
  /** Monthly price per customer */
  monthlyPrice: number;
  /** New customers acquired per month */
  newCustomersPerMonth: number;
  /** Monthly customer churn rate (e.g. 0.05 = 5%) */
  monthlyChurnRate: number;
  /** Monthly expansion rate on existing revenue (e.g. 0.02 = 2%) */
  expansionRate?: number;
  /** Monthly price increase rate (e.g. 0.01 = 1%) */
  priceGrowthRate?: number;
}

export interface OneTimeParams {
  /** Units sold per month (starting) */
  unitsPerMonth: number;
  /** Price per unit */
  pricePerUnit: number;
  /** Monthly growth in units sold */
  unitGrowthRate?: number;
}

export interface UsageBasedParams {
  /** Starting number of active users */
  activeUsers: number;
  /** Average usage units per user per month */
  avgUsagePerUser: number;
  /** Price per usage unit */
  pricePerUnit: number;
  /** Monthly user growth rate */
  userGrowthRate?: number;
  /** Monthly usage growth rate per user */
  usageGrowthRate?: number;
}

export interface ServicesParams {
  /** Billable hours per month */
  hoursPerMonth: number;
  /** Hourly rate */
  hourlyRate: number;
  /** Monthly growth in hours */
  hoursGrowthRate?: number;
  /** Annual rate increase (applied monthly as 1/12th) */
  rateIncreaseRate?: number;
}

// ── Revenue stream input ─────────────────────────────────────────────────────

export interface RevenueStreamInput {
  id: string;
  name: string;
  type: "subscription" | "one_time" | "usage_based" | "services";
  parameters: Record<string, unknown>;
}

// ── Subscription revenue detail (for SaaS metrics) ──────────────────────────

export interface SubscriptionDetail {
  month: string;
  customers: number;
  newCustomers: number;
  churnedCustomers: number;
  mrr: number;
  newMrr: number;
  expansionMrr: number;
  /** MRR lost from full cancellations only */
  churnedMrr: number;
  /** MRR lost from downgrades (lower plan, fewer seats) — not full cancellation */
  contractionMrr?: number;
  /** Alias for contractionMrr — MRR reduction without full cancellation */
  downgradeMrr?: number;
  /** MRR from previously churned customers returning */
  reactivationMrr?: number;
  netNewMrr: number;
  /** Number of active users (distinct from accounts/customers) — for ARPU */
  activeUsers?: number;
}

// ── Core revenue functions ───────────────────────────────────────────────────

/** Compute monthly revenue for a single stream. */
export function computeRevenueStream(
  stream: RevenueStreamInput,
  periodStart: Date,
  periodEnd: Date
): MonthlySeries {
  switch (stream.type) {
    case "subscription":
      return computeSubscriptionRevenue(
        stream.parameters as unknown as SubscriptionParams,
        periodStart,
        periodEnd
      );
    case "one_time":
      return computeOneTimeRevenue(
        stream.parameters as unknown as OneTimeParams,
        periodStart,
        periodEnd
      );
    case "usage_based":
      return computeUsageRevenue(
        stream.parameters as unknown as UsageBasedParams,
        periodStart,
        periodEnd
      );
    case "services":
      return computeServicesRevenue(
        stream.parameters as unknown as ServicesParams,
        periodStart,
        periodEnd
      );
    default:
      return new Map();
  }
}

/** Compute total revenue across all streams. */
export function computeTotalRevenue(
  streams: RevenueStreamInput[],
  periodStart: Date,
  periodEnd: Date
): MonthlySeries {
  let total: MonthlySeries = new Map();
  for (const stream of streams) {
    const streamRevenue = computeRevenueStream(stream, periodStart, periodEnd);
    total = addSeries(total, streamRevenue);
  }
  return total;
}

/** Compute detailed subscription metrics (MRR waterfall). */
export function computeSubscriptionDetail(
  params: SubscriptionParams,
  periodStart: Date,
  periodEnd: Date
): SubscriptionDetail[] {
  const months = monthRange(periodStart, periodEnd);
  const details: SubscriptionDetail[] = [];

  // Guard against missing required params (e.g. legacy data or malformed onboarding)
  const startingCustomers = params.startingCustomers ?? 0;
  const monthlyPrice = params.monthlyPrice ?? 0;
  const newCustomersPerMonth = params.newCustomersPerMonth ?? 0;
  const monthlyChurnRate = params.monthlyChurnRate ?? 0;

  if (startingCustomers === 0 && monthlyPrice === 0) {
    for (const m of months) {
      details.push({
        month: monthKey(m),
        customers: 0, newCustomers: 0, churnedCustomers: 0,
        mrr: 0, newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0,
      });
    }
    return details;
  }

  // Use Decimal for the accumulating state to prevent compounding drift
  let customers = D(startingCustomers);
  let pricePerCustomer = D(monthlyPrice);

  for (let i = 0; i < months.length; i++) {
    const key = monthKey(months[i]!);

    // Churn happens on existing customers
    const churnedCustomers = customers.mul(monthlyChurnRate);
    const newCustomers = D(newCustomersPerMonth);

    // MRR components — all in Decimal
    const retainedCustomers = customers.minus(churnedCustomers);
    const existingMrr = retainedCustomers.mul(pricePerCustomer);
    const expansionMrr = existingMrr.mul(params.expansionRate ?? 0);
    const newMrr = newCustomers.mul(pricePerCustomer);
    const churnedMrr = churnedCustomers.mul(pricePerCustomer);
    const netNewMrr = newMrr.plus(expansionMrr).minus(churnedMrr);
    const totalMrr = existingMrr.plus(expansionMrr).plus(newMrr);

    details.push({
      month: key,
      customers: dRound2(retainedCustomers.plus(newCustomers)),
      newCustomers: params.newCustomersPerMonth,
      churnedCustomers: dRound2(churnedCustomers),
      mrr: dRound2(totalMrr),
      newMrr: dRound2(newMrr),
      expansionMrr: dRound2(expansionMrr),
      churnedMrr: dRound2(churnedMrr),
      netNewMrr: dRound2(netNewMrr),
    });

    // Update for next month — keep in Decimal for precision across iterations
    customers = customers.minus(churnedCustomers).plus(newCustomers);
    pricePerCustomer = pricePerCustomer.mul(D(1).plus(params.priceGrowthRate ?? 0));
  }

  return details;
}

// ── Individual revenue type calculations ─────────────────────────────────────

function computeSubscriptionRevenue(
  params: SubscriptionParams,
  periodStart: Date,
  periodEnd: Date
): MonthlySeries {
  const details = computeSubscriptionDetail(params, periodStart, periodEnd);
  const series: MonthlySeries = new Map();
  for (const d of details) {
    series.set(d.month, d.mrr);
  }
  return series;
}

function computeOneTimeRevenue(
  params: OneTimeParams,
  periodStart: Date,
  periodEnd: Date
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
  const series: MonthlySeries = new Map();

  // Guard against missing required params (e.g. legacy data with {amount} shape)
  const unitsPerMonth = params.unitsPerMonth ?? 0;
  const pricePerUnit = params.pricePerUnit ?? 0;
  if (unitsPerMonth === 0 && pricePerUnit === 0) {
    for (const m of months) series.set(monthKey(m), 0);
    return series;
  }

  for (let i = 0; i < months.length; i++) {
    const units = dMul(unitsPerMonth, dPow(D(1).plus(params.unitGrowthRate ?? 0), i));
    series.set(monthKey(months[i]!), dRound2(units.mul(pricePerUnit)));
  }

  return series;
}

function computeUsageRevenue(
  params: UsageBasedParams,
  periodStart: Date,
  periodEnd: Date
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
  const series: MonthlySeries = new Map();

  // Guard against missing required params (e.g. legacy data with {amount} shape)
  const activeUsers = params.activeUsers ?? 0;
  const avgUsagePerUser = params.avgUsagePerUser ?? 0;
  const pricePerUnit = params.pricePerUnit ?? 0;
  if (activeUsers === 0 && pricePerUnit === 0) {
    for (const m of months) series.set(monthKey(m), 0);
    return series;
  }

  for (let i = 0; i < months.length; i++) {
    const users = D(activeUsers).mul(dPow(D(1).plus(params.userGrowthRate ?? 0), i));
    const usage = D(avgUsagePerUser).mul(dPow(D(1).plus(params.usageGrowthRate ?? 0), i));
    series.set(monthKey(months[i]!), dRound2(users.mul(usage).mul(pricePerUnit)));
  }

  return series;
}

function computeServicesRevenue(
  params: ServicesParams,
  periodStart: Date,
  periodEnd: Date
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
  const series: MonthlySeries = new Map();

  // Guard against missing required params (e.g. legacy data with {amount} shape)
  const hoursPerMonth = params.hoursPerMonth ?? 0;
  const hourlyRate = params.hourlyRate ?? 0;
  if (hoursPerMonth === 0 && hourlyRate === 0) {
    for (const m of months) series.set(monthKey(m), 0);
    return series;
  }

  for (let i = 0; i < months.length; i++) {
    const hours = D(hoursPerMonth).mul(dPow(D(1).plus(params.hoursGrowthRate ?? 0), i));
    const rate = D(hourlyRate).mul(dPow(D(1).plus(D(params.rateIncreaseRate ?? 0).div(12)), i));
    series.set(monthKey(months[i]!), dRound2(hours.mul(rate)));
  }

  return series;
}
