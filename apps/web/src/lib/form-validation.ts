import { z } from "zod";

/* ── Expense form schema ─────────────────────────────────────────────── */

export const expenseFormSchema = z.object({
  name: z.string().min(1, "Name is required").min(2, "Name must be at least 2 characters"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Amount must be a positive number"),
  growthRate: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
});

/* ── Revenue stream form schema ──────────────────────────────────────── */

const positiveNumberStr = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, `${label} must be a non-negative number`);

export const revenueStreamFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["subscription", "services", "one_time", "usage_based"]),
});

export const subscriptionParamsSchema = z.object({
  monthlyPrice: positiveNumberStr("Monthly price"),
  startingCustomers: positiveNumberStr("Starting customers"),
  newCustomersPerMonth: positiveNumberStr("New customers/month"),
  monthlyChurnRate: z
    .string()
    .min(1, "Churn rate is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, "Churn rate must be 0–100"),
});

export const servicesParamsSchema = z.object({
  hourlyRate: positiveNumberStr("Hourly rate"),
  monthlyHours: positiveNumberStr("Monthly hours"),
});

export const oneTimeParamsSchema = z.object({
  unitPrice: positiveNumberStr("Unit price"),
  monthlyUnits: positiveNumberStr("Monthly units"),
});

export const usageBasedParamsSchema = z.object({
  pricePerUnit: positiveNumberStr("Price per unit"),
  expectedUnits: positiveNumberStr("Expected units"),
});

/* ── Team / Hire form schema ─────────────────────────────────────────── */

export const hireFormSchema = z.object({
  title: z.string().min(1, "Role / title is required"),
  count: z
    .string()
    .min(1, "Count is required")
    .refine((v) => !isNaN(Number(v)) && Number.isInteger(Number(v)) && Number(v) >= 1, "Count must be at least 1"),
  salary: z
    .string()
    .min(1, "Salary is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Salary must be a positive number")
    .refine((v) => Number(v) <= 10_000_000, "Salary seems too high — please double-check"),
  benefitsRate: z
    .string()
    .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100), "Benefits rate must be 0–100"),
  startDate: z.string().min(1, "Start date is required"),
});

/* ── Funding round form schema ───────────────────────────────────────── */

export const fundingFormSchema = z.object({
  name: z.string().min(1, "Round name is required"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Amount must be a positive number"),
  date: z.string().min(1, "Date is required"),
  preMoneyValuation: z
    .string()
    .refine((v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0), "Valuation must be a non-negative number"),
  dilutionPercent: z
    .string()
    .refine(
      (v) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100),
      "Dilution must be 0–100%",
    ),
});

/* ── Scenario name schema ────────────────────────────────────────────── */

export const scenarioNameSchema = z.object({
  name: z.string().min(1, "Scenario name is required").min(2, "Name must be at least 2 characters"),
});

/* ── Validation helper ───────────────────────────────────────────────── */

/**
 * Validate a single field value against a Zod schema.
 * Returns the first error message or null if valid.
 */
export function validateField(
  schema: z.AnyZodObject,
  field: string,
  value: string,
): string | null {
  if (!(field in schema.shape)) return null;
  const fieldSchema = (schema.shape as Record<string, z.ZodTypeAny>)[field]!;
  const result = fieldSchema.safeParse(value);
  if (result.success) return null;
  return (result.error as z.ZodError).issues[0]?.message ?? "Invalid value";
}

/**
 * Validate all fields at once. Returns a record of field → error message.
 * Only includes fields that have errors.
 */
export function validateAll(
  schema: z.AnyZodObject,
  values: Record<string, string>,
): Record<string, string> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of (result.error as z.ZodError).issues) {
    const key = String(issue.path[0]);
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
