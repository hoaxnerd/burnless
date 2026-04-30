/**
 * Revenue stream parameter helpers.
 *
 * Mirrors the expense-params / headcount-params convention (umbrella §1.7).
 *
 * Provides:
 *  - defaultParamsForType  — engine-canonical zero-seeded params for each stream type
 *  - normalizeStreamPayload — coerces form payload (date strings → Date, ensures parameters key)
 *  - validateTiers         — throws descriptive errors when tiers are invalid
 */

import type { PricingTier } from "@burnless/engine";

export type RevenueStreamType =
  | "subscription"
  | "one_time"
  | "usage_based"
  | "services"
  | "marketplace"
  | "ecommerce"
  | "hardware";

/**
 * Returns the engine-canonical params object pre-populated with zero/sensible
 * defaults for each of the 7 stream types.
 */
export function defaultParamsForType(type: RevenueStreamType): Record<string, unknown> {
  switch (type) {
    case "subscription":
      return {
        startingCustomers: 0,
        monthlyPrice: 0,
        newCustomersPerMonth: 0,
        monthlyChurnRate: 0,
      };
    case "one_time":
      return { unitsPerMonth: 0, pricePerUnit: 0 };
    case "usage_based":
      return { activeUsers: 0, avgUsagePerUser: 0, pricePerUnit: 0 };
    case "services":
      return { hoursPerMonth: 0, hourlyRate: 0 };
    case "marketplace":
      return { startingGmv: 0, takeRate: 0 };
    case "ecommerce":
      return { ordersPerMonth: 0, averageOrderValue: 0 };
    case "hardware":
      return { unitsPerMonth: 0, pricePerUnit: 0 };
  }
}

// ── normalizeStreamPayload ────────────────────────────────────────────────────

export interface StreamPayloadInput {
  name: string;
  type: RevenueStreamType;
  startDate: string | Date;
  endDate: string | Date | null;
  parameters?: Record<string, unknown>;
}

export interface StreamPayloadNormalized {
  name: string;
  type: RevenueStreamType;
  startDate: Date;
  endDate: Date | null;
  parameters: Record<string, unknown>;
}

/**
 * Coerces a form payload so it is ready for the API route:
 *  - date strings → Date instances
 *  - ensures parameters key exists (defaults to {})
 */
export function normalizeStreamPayload(input: StreamPayloadInput): StreamPayloadNormalized {
  return {
    name: input.name,
    type: input.type,
    startDate: input.startDate instanceof Date ? input.startDate : new Date(input.startDate),
    endDate:
      input.endDate === null
        ? null
        : input.endDate instanceof Date
          ? input.endDate
          : new Date(input.endDate),
    parameters: input.parameters ?? {},
  };
}

// ── validateTiers ─────────────────────────────────────────────────────────────

/**
 * Validates a PricingTier[] array.
 *
 * Throws Error with a user-readable message (safe to render inline in a form)
 * when tiers:
 *  1. are not in strictly ascending order by minUnits
 *  2. have a null maxUnits in any position other than the last
 *  3. have overlapping ranges (previous maxUnits >= next minUnits)
 */
export function validateTiers(tiers: PricingTier[]): void {
  if (tiers.length === 0) return;

  // 1) Strictly ascending by minUnits.
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.minUnits <= tiers[i - 1]!.minUnits) {
      throw new Error(
        `Tiers must be in ascending order by minUnits. Tier "${tiers[i]!.name}" ` +
          `has minUnits ${tiers[i]!.minUnits} but follows a tier with minUnits ` +
          `${tiers[i - 1]!.minUnits}. Re-order tiers so each minUnits is strictly greater than the previous.`,
      );
    }
  }

  // 2) Only the last tier may have a null maxUnits (open-ended).
  for (let i = 0; i < tiers.length - 1; i++) {
    if (tiers[i]!.maxUnits === null) {
      throw new Error(
        `Only the last tier may have null maxUnits (open-ended). ` +
          `Tier "${tiers[i]!.name}" at position ${i + 1} of ${tiers.length} has null maxUnits ` +
          `but is not the last tier. Set a numeric maxUnits or move the open-ended tier to last position.`,
      );
    }
  }

  // 3) No overlapping ranges (previous maxUnits must be < current minUnits).
  for (let i = 1; i < tiers.length; i++) {
    const prevMax = tiers[i - 1]!.maxUnits;
    if (prevMax !== null && tiers[i]!.minUnits <= prevMax) {
      throw new Error(
        `Tier ranges overlap. Tier "${tiers[i]!.name}" starts at ${tiers[i]!.minUnits} ` +
          `but the previous tier "${tiers[i - 1]!.name}" extends to ${prevMax}. ` +
          `Adjust maxUnits of the previous tier or minUnits of this tier so ranges do not overlap.`,
      );
    }
  }
}
