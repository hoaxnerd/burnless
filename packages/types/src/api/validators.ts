import { z } from "zod";

// DB column is numeric(18,2) -> max 9,999,999,999,999,999.99
const MAX_AMOUNT = 9_999_999_999_999_999.99;

/** Monetary amount that can be positive or negative (e.g. transactions). Rejects NaN/Infinity. */
export const monetaryAmount = () =>
  z.number().finite().min(-MAX_AMOUNT).max(MAX_AMOUNT);

/** Non-negative monetary amount (e.g. funding rounds, salaries). Rejects NaN/Infinity. */
export const positiveAmount = () =>
  z.number().finite().min(0).max(MAX_AMOUNT);

/** Percentage expressed as 0-100 (e.g. dilution percent). */
export const percentage = () =>
  z.number().finite().min(0).max(100);

/** Percentage expressed as 0-1 (e.g. benefits rate). */
export const ratio = () =>
  z.number().finite().min(0).max(1);

/**
 * VAL-01/DATE-01: build a LOCAL-midnight Date for a bare YYYY-MM-DD so the insert
 * side agrees with the engine DATE-02 monthKey read side (both local). Other date
 * strings (ISO datetimes) pass through unchanged.
 */
const toLocalDate = (s: string) =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);

/** Required date string: rejects empty/unparseable; transforms to a local Date. */
export const dateString = () =>
  z
    .string()
    .min(1, "Date is required")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date")
    .transform(toLocalDate);

/** Nullable date string: null/absent -> null; rejects '' and garbage; valid -> local Date. */
export const nullableDateString = () =>
  z
    .string()
    .min(1, "Date is required")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date")
    .transform(toLocalDate)
    .nullable()
    .default(null);

/**
 * VAL-03/DATE-03: cross-field date-range invariant. Wraps a ZodObject and rejects
 * an `endDate` earlier than `startDate` when BOTH are present (non-null). An absent
 * or null endDate (open-ended) is allowed, and an absent startDate (e.g. partial
 * update) is allowed. Works on either post-transform `Date` values (headcount /
 * forecast schemas) or raw `YYYY-MM-DD` strings (revenue-stream schema) — both are
 * coerced to a comparable epoch via `Date`.
 */
const toEpoch = (v: unknown): number | null => {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};

export const withDateRange = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (data: { startDate?: unknown; endDate?: unknown }) => {
      const start = toEpoch(data?.startDate);
      const end = toEpoch(data?.endDate);
      if (start == null || end == null) return true; // open-ended / absent => allowed
      return start <= end;
    },
    { message: "endDate must be on or after startDate", path: ["endDate"] },
  );
