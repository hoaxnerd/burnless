/**
 * Revenue modeling engine — generates monthly revenue projections from revenue stream definitions.
 *
 * Supports 4 revenue types:
 * - subscription: recurring SaaS revenue with customer growth and churn
 * - one_time: non-recurring revenue (product sales, setup fees)
 * - usage_based: consumption-based pricing
 * - services: time-based billing (consulting, professional services)
 */

import {
  type MonthlySeries,
  monthRange,
  monthKey,
  round2,
  addSeries,
} from "./utils";

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
  churnedMrr: number;
  netNewMrr: number;
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

  let customers = params.startingCustomers;
  let pricePerCustomer = params.monthlyPrice;

  for (let i = 0; i < months.length; i++) {
    const key = monthKey(months[i]!);

    // Churn happens on existing customers
    const churnedCustomers = round2(customers * params.monthlyChurnRate);
    const newCustomers = params.newCustomersPerMonth;

    // MRR components
    const existingMrr = round2((customers - churnedCustomers) * pricePerCustomer);
    const expansionMrr = round2(existingMrr * (params.expansionRate ?? 0));
    const newMrr = round2(newCustomers * pricePerCustomer);
    const churnedMrr = round2(churnedCustomers * pricePerCustomer);
    const netNewMrr = round2(newMrr + expansionMrr - churnedMrr);
    const totalMrr = round2(existingMrr + expansionMrr + newMrr);

    details.push({
      month: key,
      customers: round2(customers - churnedCustomers + newCustomers),
      newCustomers,
      churnedCustomers: round2(churnedCustomers),
      mrr: totalMrr,
      newMrr,
      expansionMrr,
      churnedMrr,
      netNewMrr,
    });

    // Update for next month
    customers = customers - churnedCustomers + newCustomers;
    pricePerCustomer *= 1 + (params.priceGrowthRate ?? 0);
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

  for (let i = 0; i < months.length; i++) {
    const units = params.unitsPerMonth * Math.pow(1 + (params.unitGrowthRate ?? 0), i);
    series.set(monthKey(months[i]!), round2(units * params.pricePerUnit));
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

  for (let i = 0; i < months.length; i++) {
    const users = params.activeUsers * Math.pow(1 + (params.userGrowthRate ?? 0), i);
    const usage = params.avgUsagePerUser * Math.pow(1 + (params.usageGrowthRate ?? 0), i);
    series.set(monthKey(months[i]!), round2(users * usage * params.pricePerUnit));
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

  for (let i = 0; i < months.length; i++) {
    const hours = params.hoursPerMonth * Math.pow(1 + (params.hoursGrowthRate ?? 0), i);
    const rate = params.hourlyRate * Math.pow(1 + (params.rateIncreaseRate ?? 0) / 12, i);
    series.set(monthKey(months[i]!), round2(hours * rate));
  }

  return series;
}
