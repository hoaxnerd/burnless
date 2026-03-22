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

/** Date string that transforms to a Date object. */
export const dateString = () =>
  z.string().transform((s) => new Date(s));

/** Nullable date string that transforms to Date | null. */
export const nullableDateString = () =>
  z.string().nullable().default(null).transform((s) => (s ? new Date(s) : null));
