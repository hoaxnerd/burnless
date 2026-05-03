/**
 * Zod schemas for AI tool inputs targeting expenses (forecast lines).
 *
 * Mirrors the JSON Schema shape exposed in `tools.ts` so handlers can
 * `safeParse()` provider-supplied tool arguments and reject malformed input
 * before it reaches the database.
 *
 * Phase 1 §1.5 — covers the new top-level fields: `vendor`, `notes`,
 * `frequency`, `departmentId`, `isOneTime`, `isRecurring` (tri-state).
 */

import { z } from "zod";

export const ExpenseFrequencySchema = z.enum([
  "monthly",
  "quarterly",
  "annual",
]);

export const ForecastMethodSchema = z.enum([
  "fixed",
  "growth_rate",
  "per_unit",
  "percentage_of",
  "custom_formula",
]);

/** ISO date string `YYYY-MM-DD` (Zod v3.23+ helper). */
const isoDate = z.string().date();

/**
 * Input schema for `update_expense` AI tool.
 * `id` is required; all other fields are optional patches.
 * `null` on nullable fields explicitly clears the value.
 */
export const UpdateExpenseSchema = z.object({
  id: z.string().min(1),
  notes: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  frequency: ExpenseFrequencySchema.optional(),
  isOneTime: z.boolean().optional(),
  // Tri-state: true | false | null (cleared) | undefined (untouched)
  isRecurring: z.boolean().nullable().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.nullable().optional(),
  method: ForecastMethodSchema.optional(),
  parameters: z.record(z.unknown()).optional(),
});

/**
 * Input schema for `create_expense` AI tool.
 * Mirrors `forecast_lines` row contract with Phase-1 fields.
 */
export const CreateExpenseSchema = z.object({
  accountId: z.string().min(1),
  method: ForecastMethodSchema,
  parameters: z.record(z.unknown()).default({}),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  notes: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  frequency: ExpenseFrequencySchema.default("monthly"),
  isOneTime: z.boolean().default(false),
  isRecurring: z.boolean().nullable().optional(),
});

export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
