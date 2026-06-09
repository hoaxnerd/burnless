/**
 * Revenue modeling engine — generates monthly revenue projections from revenue stream definitions.
 *
 * Supports 7 revenue types:
 * - subscription: recurring SaaS revenue with customer growth and churn; supports flat, per_seat,
 *   and tiered pricing via PricingTier[]
 * - one_time: non-recurring revenue (product sales, setup fees)
 * - usage_based: consumption-based pricing; supports flat and tiered pricing via PricingTier[]
 * - services: time-based billing (consulting, professional services)
 * - marketplace: GMV take-rate revenue
 * - ecommerce: order-based retail revenue
 * - hardware: unit-based product revenue with optional price decay
 *
 * All intermediate arithmetic uses Decimal.js for precision.
 */

import {
  type MonthlySeries,
  monthRange,
  monthKey,
  parseMonthKey,
  round2,
  addSeries,
  isActiveInMonth,
  proratedFraction,
} from "./utils";
import { D, dMul, dPow, dRound2 } from "./decimal";

// ── Revenue stream parameter types ───────────────────────────────────────────

export interface SubscriptionParams {
  /** Starting number of customers */
  startingCustomers: number;
  /** Monthly price per customer (used for flat pricing; overridden by tiers for per_seat/tiered) */
  monthlyPrice: number;
  /** New customers acquired per month */
  newCustomersPerMonth: number;
  /** Monthly customer churn rate (e.g. 0.05 = 5%) */
  monthlyChurnRate: number;
  /** Monthly expansion rate on existing revenue (e.g. 0.02 = 2%) */
  expansionRate?: number;
  /** Monthly price increase rate (e.g. 0.01 = 1%) */
  priceGrowthRate?: number;
  /** Pricing model: flat (default), per_seat (tier lookup × seats), tiered (tier lookup by customers) */
  pricingModel?: "flat" | "per_seat" | "tiered";
  /** Number of seats per customer — required when pricingModel is "per_seat" */
  seatsPerCustomer?: number;
  /** Ordered tiers (ascending minUnits) — used by per_seat and tiered models */
  tiers?: PricingTier[];
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
  /** Price per usage unit (used for flat pricing; overridden by tiers for tiered model) */
  pricePerUnit: number;
  /** Monthly user growth rate */
  userGrowthRate?: number;
  /** Monthly usage growth rate per user */
  usageGrowthRate?: number;
  /** Pricing model: flat (default) or tiered (tier lookup by total usage units) */
  pricingModel?: "flat" | "tiered";
  /** Ordered tiers (ascending minUnits) — used by tiered model */
  tiers?: PricingTier[];
}

export interface PricingTier {
  name: string;
  minUnits: number;
  maxUnits: number | null;
  pricePerUnit: number;
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

export interface MarketplaceParams {
  /** Starting GMV (gross merchandise volume) per month */
  startingGmv: number;
  /** Take rate as fraction (e.g. 0.15 = 15% of GMV) */
  takeRate: number;
  /** Monthly GMV growth rate (e.g. 0.10 = 10%) */
  gmvGrowthRate?: number;
}

export interface EcommerceParams {
  /** Starting orders per month */
  ordersPerMonth: number;
  /** Average order value */
  averageOrderValue: number;
  /** Monthly order growth rate */
  orderGrowthRate?: number;
  /** Monthly AOV growth rate */
  aovGrowthRate?: number;
}

export interface HardwareParams {
  /** Units sold per month (starting) */
  unitsPerMonth: number;
  /** Price per unit */
  pricePerUnit: number;
  /** Monthly unit-volume growth rate */
  unitGrowthRate?: number;
  /** Monthly price-decay rate (negative for declining prices) */
  priceGrowthRate?: number;
}

// ── Tier helpers ─────────────────────────────────────────────────────────────

/** Find the tier matching a given unit count. Tiers must be ascending by minUnits. */
export function selectTier(tiers: PricingTier[], units: number): PricingTier | null {
  for (const t of tiers) {
    if (units >= t.minUnits && (t.maxUnits === null || units <= t.maxUnits)) {
      return t;
    }
  }
  return null;
}

// ── Revenue stream input ─────────────────────────────────────────────────────

export interface RevenueStreamInput {
  id: string;
  name: string;
  type:
    | "subscription"
    | "one_time"
    | "usage_based"
    | "services"
    | "marketplace"
    | "ecommerce"
    | "hardware";
  parameters: Record<string, unknown>;
  startDate: Date;
  endDate: Date | null;
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
  periodEnd: Date,
): MonthlySeries {
  const inner = (() => {
    switch (stream.type) {
      case "subscription":
        return computeSubscriptionRevenue(
          stream.parameters as unknown as SubscriptionParams,
          periodStart,
          periodEnd,
        );
      case "one_time":
        return computeOneTimeRevenue(
          stream.parameters as unknown as OneTimeParams,
          periodStart,
          periodEnd,
        );
      case "usage_based":
        return computeUsageRevenue(
          stream.parameters as unknown as UsageBasedParams,
          periodStart,
          periodEnd,
        );
      case "services":
        return computeServicesRevenue(
          stream.parameters as unknown as ServicesParams,
          periodStart,
          periodEnd,
        );
      case "marketplace":
        return computeMarketplaceRevenue(
          stream.parameters as unknown as MarketplaceParams,
          periodStart,
          periodEnd,
        );
      case "ecommerce":
        return computeEcommerceRevenue(
          stream.parameters as unknown as EcommerceParams,
          periodStart,
          periodEnd,
        );
      case "hardware":
        return computeHardwareRevenue(
          stream.parameters as unknown as HardwareParams,
          periodStart,
          periodEnd,
        );
      default:
        return new Map<string, number>();
    }
  })();

  // Apply activity gate + proration on the inner series.
  const months = monthRange(periodStart, periodEnd);
  const gated: MonthlySeries = new Map();
  for (const m of months) {
    const key = monthKey(m);
    const raw = inner.get(key) ?? 0;
    if (!isActiveInMonth(m, stream.startDate, stream.endDate)) {
      gated.set(key, 0);
      continue;
    }
    const fraction = proratedFraction(m, stream.startDate, stream.endDate);
    gated.set(key, round2(raw * fraction));
  }
  return gated;
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

  // Per-seat mode: override pricePerCustomer each iteration via tier lookup × seats
  const isPerSeat =
    params.pricingModel === "per_seat" &&
    Array.isArray(params.tiers) &&
    params.seatsPerCustomer != null;

  for (let i = 0; i < months.length; i++) {
    const key = monthKey(months[i]!);

    // Per-seat: resolve price from tier before this period's MRR math
    if (isPerSeat) {
      const tier = selectTier(params.tiers!, params.seatsPerCustomer!);
      pricePerCustomer = D(tier?.pricePerUnit ?? 0).mul(params.seatsPerCustomer!);
    }

    // Churn happens on existing customers
    const churnedCustomers = customers.mul(monthlyChurnRate);
    const newCustomers = D(newCustomersPerMonth);

    // MRR components — all in Decimal
    const retainedCustomers = customers.minus(churnedCustomers);
    const existingMrr = retainedCustomers.mul(pricePerCustomer);
    const expansionMrr = existingMrr.mul(params.expansionRate ?? 0);
    const newMrr = newCustomers.mul(pricePerCustomer);
    const churnedMrr = churnedCustomers.mul(pricePerCustomer);
    // Phase 6 6.2 §1 — canonical netNewMrr is the explicit 5-term formula
    // New + Expansion + Reactivation − Churned − Contraction. The subscription
    // model never produces contraction (downgrades) or reactivation, so these
    // are named zero Decimals here (a no-op on real data). They are intentionally
    // NOT written onto the pushed SubscriptionDetail (kept undefined) so
    // indexSubscriptionDetails treats them as absent.
    const contractionMrr = D(0);
    const reactivationMrr = D(0);
    const netNewMrr = newMrr
      .plus(expansionMrr)
      .plus(reactivationMrr)
      .minus(churnedMrr)
      .minus(contractionMrr);
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
    const endingCustomers = retainedCustomers.plus(newCustomers);
    customers = endingCustomers;
    // Embed expansion into effective ARPA: totalMrr / endingCustomers gives
    // the new per-customer price that includes upsells/expansion from this period.
    // Then apply explicit priceGrowthRate on top.
    if (endingCustomers.gt(0)) {
      pricePerCustomer = totalMrr.div(endingCustomers).mul(D(1).plus(params.priceGrowthRate ?? 0));
    } else {
      pricePerCustomer = pricePerCustomer.mul(D(1).plus(params.priceGrowthRate ?? 0));
    }
  }

  return details;
}

/**
 * Subscription MRR detail gated to the stream's active window.
 *
 * `computeSubscriptionDetail` takes only `params` and has no knowledge of the
 * stream's start/end dates, so on its own it accrues MRR across the entire
 * period — leaking MRR for subscriptions that haven't started yet (or have
 * ended). This wrapper applies the SAME activity gate + proration that
 * `computeRevenueStream` applies, so MRR matches the subscription's revenue
 * month-for-month. MRR/ARR consumers must use this, not the raw detail.
 */
export function computeSubscriptionDetailForStream(
  stream: RevenueStreamInput,
  periodStart: Date,
  periodEnd: Date,
): SubscriptionDetail[] {
  const raw = computeSubscriptionDetail(
    stream.parameters as unknown as SubscriptionParams,
    periodStart,
    periodEnd,
  );
  return raw.map((d) => {
    const month = parseMonthKey(d.month);
    if (!isActiveInMonth(month, stream.startDate, stream.endDate)) {
      return {
        month: d.month,
        customers: 0,
        newCustomers: 0,
        churnedCustomers: 0,
        mrr: 0,
        newMrr: 0,
        expansionMrr: 0,
        churnedMrr: 0,
        netNewMrr: 0,
      };
    }
    const f = proratedFraction(month, stream.startDate, stream.endDate);
    return {
      month: d.month,
      customers: d.customers,
      newCustomers: d.newCustomers,
      churnedCustomers: d.churnedCustomers,
      mrr: round2(d.mrr * f),
      newMrr: round2(d.newMrr * f),
      expansionMrr: round2(d.expansionMrr * f),
      churnedMrr: round2(d.churnedMrr * f),
      netNewMrr: round2(d.netNewMrr * f),
    };
  });
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
    const totalUsage = dRound2(users.mul(usage));
    const effectivePrice =
      params.pricingModel === "tiered" && Array.isArray(params.tiers)
        ? selectTier(params.tiers, totalUsage)?.pricePerUnit ?? 0
        : pricePerUnit;
    series.set(monthKey(months[i]!), dRound2(D(totalUsage).mul(effectivePrice)));
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

// ── Marketplace / Ecommerce / Hardware revenue handlers ──────────────────────

function computeMarketplaceRevenue(
  params: MarketplaceParams,
  periodStart: Date,
  periodEnd: Date,
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
  const series: MonthlySeries = new Map();
  const startingGmv = params.startingGmv ?? 0;
  const takeRate = params.takeRate ?? 0;
  if (startingGmv === 0 || takeRate === 0) {
    for (const m of months) series.set(monthKey(m), 0);
    return series;
  }
  for (let i = 0; i < months.length; i++) {
    const gmv = D(startingGmv).mul(dPow(D(1).plus(params.gmvGrowthRate ?? 0), i));
    series.set(monthKey(months[i]!), dRound2(gmv.mul(takeRate)));
  }
  return series;
}

function computeEcommerceRevenue(
  params: EcommerceParams,
  periodStart: Date,
  periodEnd: Date,
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
  const series: MonthlySeries = new Map();
  const orders0 = params.ordersPerMonth ?? 0;
  const aov0 = params.averageOrderValue ?? 0;
  if (orders0 === 0 || aov0 === 0) {
    for (const m of months) series.set(monthKey(m), 0);
    return series;
  }
  for (let i = 0; i < months.length; i++) {
    const orders = D(orders0).mul(dPow(D(1).plus(params.orderGrowthRate ?? 0), i));
    const aov = D(aov0).mul(dPow(D(1).plus(params.aovGrowthRate ?? 0), i));
    series.set(monthKey(months[i]!), dRound2(orders.mul(aov)));
  }
  return series;
}

function computeHardwareRevenue(
  params: HardwareParams,
  periodStart: Date,
  periodEnd: Date,
): MonthlySeries {
  const months = monthRange(periodStart, periodEnd);
  const series: MonthlySeries = new Map();
  const units0 = params.unitsPerMonth ?? 0;
  const price0 = params.pricePerUnit ?? 0;
  if (units0 === 0 || price0 === 0) {
    for (const m of months) series.set(monthKey(m), 0);
    return series;
  }
  for (let i = 0; i < months.length; i++) {
    const units = D(units0).mul(dPow(D(1).plus(params.unitGrowthRate ?? 0), i));
    const price = D(price0).mul(dPow(D(1).plus(params.priceGrowthRate ?? 0), i));
    series.set(monthKey(months[i]!), dRound2(units.mul(price)));
  }
  return series;
}
