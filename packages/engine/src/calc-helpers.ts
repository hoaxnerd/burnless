/**
 * Single-source derived-arithmetic helpers.
 *
 * Directive: NO page/component/lib may compute financial figures inline — even
 * a `value * 100` percentage conversion routes through here so display math
 * can never drift from the engine. All arithmetic uses Decimal for precision;
 * rounding is left to the display layer (formatMetricValue / formatCurrency).
 *
 * Guarded by `apps/web/src/__tests__/no-inline-financial-calc.test.ts`.
 */
import { D } from "./decimal";

/**
 * Month-over-month (or any two-point) percent change, signed against the
 * MAGNITUDE of the previous value so a rise from a negative baseline reads as
 * a gain. Returns `null` when `previous` is 0 (change is undefined), letting
 * callers choose their own fallback (`?? 0`, render "—", etc.).
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return D(current).minus(previous).div(D(previous).abs()).mul(100).toNumber();
}

/** Fraction form of {@link pctChange} (0.1 instead of 10). `null` when previous is 0. */
export function ratioChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return D(current).minus(previous).div(D(previous).abs()).toNumber();
}

/** Percentage that `part` represents of `total`. Returns 0 when `total` is 0. */
export function pctOfTotal(part: number, total: number): number {
  if (total === 0) return 0;
  return D(part).div(total).mul(100).toNumber();
}

/** Convert a 0-1 rate (churn, take-rate, benefits, ownership, confidence) to a 0-100 percentage for display. */
export function ratioToPct(ratio: number): number {
  return D(ratio).mul(100).toNumber();
}

/** Annual run-rate from a monthly figure (monthly × 12). */
export function annualize(monthly: number): number {
  return D(monthly).mul(12).toNumber();
}
