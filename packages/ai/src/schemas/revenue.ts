/**
 * Canonical Zod schemas for revenue stream tool inputs.
 *
 * Single source of truth consumed by:
 *   - packages/ai/src/tools.ts  (tool description narrative references these field names)
 *   - apps/web/src/lib/ai-tools/revenue.ts  (handler validation)
 */
import { z } from "zod";

// ── Sub-schemas ───────────────────────────────────────────────────────────────

export const PricingTierSchema = z.object({
  name: z.string().min(1),
  minUnits: z.number().int().nonnegative(),
  maxUnits: z.number().int().nonnegative().nullable(),
  pricePerUnit: z.number().nonnegative(),
});

export const SubscriptionParamsSchema = z.object({
  startingCustomers: z.number().int().nonnegative(),
  monthlyPrice: z.number().nonnegative(),
  newCustomersPerMonth: z.number().int().nonnegative(),
  monthlyChurnRate: z.number().min(0).max(1),
  expansionRate: z.number().min(0).max(1).optional(),
  priceGrowthRate: z.number().min(-1).max(1).optional(),
  pricingModel: z.enum(["flat", "per_seat", "tiered"]).optional(),
  seatsPerCustomer: z.number().int().positive().optional(),
  tiers: z.array(PricingTierSchema).optional(),
});

export const OneTimeParamsSchema = z.object({
  unitsPerMonth: z.number().nonnegative(),
  pricePerUnit: z.number().nonnegative(),
  unitGrowthRate: z.number().min(-1).max(1).optional(),
});

export const UsageBasedParamsSchema = z.object({
  activeUsers: z.number().int().nonnegative(),
  avgUsagePerUser: z.number().nonnegative(),
  pricePerUnit: z.number().nonnegative(),
  userGrowthRate: z.number().min(-1).max(1).optional(),
  usageGrowthRate: z.number().min(-1).max(1).optional(),
  pricingModel: z.enum(["flat", "tiered"]).optional(),
  tiers: z.array(PricingTierSchema).optional(),
});

export const ServicesParamsSchema = z.object({
  hoursPerMonth: z.number().nonnegative(),
  hourlyRate: z.number().nonnegative(),
  hoursGrowthRate: z.number().min(-1).max(1).optional(),
  rateIncreaseRate: z.number().min(-1).max(1).optional(),
});

export const MarketplaceParamsSchema = z.object({
  startingGmv: z.number().nonnegative(),
  takeRate: z.number().min(0).max(1),
  gmvGrowthRate: z.number().min(-1).max(1).optional(),
});

export const EcommerceParamsSchema = z.object({
  ordersPerMonth: z.number().nonnegative(),
  averageOrderValue: z.number().nonnegative(),
  orderGrowthRate: z.number().min(-1).max(1).optional(),
  aovGrowthRate: z.number().min(-1).max(1).optional(),
});

export const HardwareParamsSchema = z.object({
  unitsPerMonth: z.number().nonnegative(),
  pricePerUnit: z.number().nonnegative(),
  unitGrowthRate: z.number().min(-1).max(1).optional(),
  priceGrowthRate: z.number().min(-1).max(1).optional(),
});

// ── Revenue stream type ───────────────────────────────────────────────────────

export const RevenueStreamTypeSchema = z.enum([
  "subscription",
  "one_time",
  "usage_based",
  "services",
  "marketplace",
  "ecommerce",
  "hardware",
]);

// ── Top-level tool schemas ────────────────────────────────────────────────────

export const AddRevenueStreamSchema = z.object({
  name: z.string().min(1),
  type: RevenueStreamTypeSchema,
  startDate: z.string().date(), // ISO YYYY-MM-DD, validated by Zod
  endDate: z.string().date().nullable().optional(),
  parameters: z.record(z.unknown()).default({}),
});

export const UpdateRevenueStreamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  type: RevenueStreamTypeSchema.optional(),
  startDate: z.string().date().optional(), // ISO YYYY-MM-DD
  endDate: z.string().date().nullable().optional(),
  parameters: z.record(z.unknown()).optional(),
});
