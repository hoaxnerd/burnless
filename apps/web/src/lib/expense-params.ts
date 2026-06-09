/**
 * Per-method defaults factory + payload normalizer + per-method Zod validation
 * for expense forecast lines (Phase 1 §1.7).
 *
 * Param shapes mirror the runtime engine (`packages/engine/src/forecasting.ts`)
 * so values produced here round-trip through `computeForecastLine` without
 * silent fallbacks to zero.
 *
 * Method enum mirrors `ForecastMethodSchema` in `@burnless/ai/schemas/expenses`.
 */

import { z } from "zod";

export type ForecastMethod =
  | "fixed"
  | "growth_rate"
  | "per_unit"
  | "percentage_of"
  | "custom_formula";

// ── Per-method param schemas ─────────────────────────────────────────────────
// `.strict()` so wrong-shape detection works (extra/foreign keys → reject).

export const FixedParams = z
  .object({
    amount: z.number(),
  })
  .strict();

export const GrowthRateParams = z
  .object({
    baseAmount: z.number(),
    monthlyGrowthRate: z.number(),
  })
  .strict();

export const PerUnitParams = z
  .object({
    units: z.number(),
    pricePerUnit: z.number(),
    unitGrowthRate: z.number().optional(),
    priceGrowthRate: z.number().optional(),
  })
  .strict();

export const PercentageOfParams = z
  .object({
    sourceLineId: z.string().min(1, "sourceLineId required"),
    percentage: z.number(),
  })
  .strict();

export const CustomFormulaParams = z
  .object({
    expression: z.string().min(1, "expression required"),
    variables: z.record(z.union([z.number(), z.string()])).optional(),
  })
  .strict();

const PARAM_SCHEMAS = {
  fixed: FixedParams,
  growth_rate: GrowthRateParams,
  per_unit: PerUnitParams,
  percentage_of: PercentageOfParams,
  custom_formula: CustomFormulaParams,
} as const;

// ── Defaults factory ─────────────────────────────────────────────────────────

export function defaultParamsForMethod(
  method: ForecastMethod,
): Record<string, unknown> {
  switch (method) {
    case "fixed":
      return { amount: 0 };
    case "growth_rate":
      return { baseAmount: 0, monthlyGrowthRate: 0 };
    case "per_unit":
      return { units: 0, pricePerUnit: 0 };
    case "percentage_of":
      return { sourceLineId: "", percentage: 0 };
    case "custom_formula":
      return { expression: "" };
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

export type ValidateResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

export function validateExpenseParams(
  method: ForecastMethod,
  params: unknown,
): ValidateResult {
  const schema = PARAM_SCHEMAS[method];
  const r = schema.safeParse(params);
  if (r.success) return { success: true, data: r.data };
  return { success: false, error: r.error.message };
}

// ── Payload normalization ────────────────────────────────────────────────────

export interface ExpensePayloadInput {
  method: ForecastMethod;
  parameters: Record<string, unknown>;
  startDate: string | Date;
  endDate: string | Date | null;
  frequency: "monthly" | "quarterly" | "annual";
  isOneTime: boolean;
  isRecurring?: boolean | null;
  vendor?: string | null;
  notes?: string | null;
  /**
   * Phase 4 §4.6 — stable line name a `custom_formula` expression can reference.
   * null = unnamed (not referenceable by name). Bound to `forecastLines.name`.
   */
  name?: string | null;
  /** Explicit per-line category override; null = derive automatically. */
  subcategory?: string | null;
  departmentId?: string | null;
  accountId?: string;
  id?: string;
}

export interface ExpensePayloadNormalized
  extends Omit<ExpensePayloadInput, "startDate" | "endDate" | "subcategory"> {
  startDate: Date;
  endDate: Date | null;
  subcategory: string | null;
}

export function normalizeExpensePayload(
  input: ExpensePayloadInput,
): ExpensePayloadNormalized {
  const startDate =
    input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
  const endDate =
    input.endDate === null
      ? null
      : input.endDate instanceof Date
        ? input.endDate
        : new Date(input.endDate);
  // Default null when absent/empty so an unset category clears the override.
  const subcategory =
    typeof input.subcategory === "string" && input.subcategory.trim() !== ""
      ? input.subcategory.trim()
      : null;
  return { ...input, startDate, endDate, subcategory };
}
