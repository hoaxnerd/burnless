/**
 * Decimal.js wrapper for precise financial arithmetic.
 *
 * All intermediate financial calculations use Decimal to eliminate
 * floating-point accumulation errors. Numbers are converted back at
 * output boundaries (round2, seriesToArray).
 */

import Decimal from "decimal.js";

// Configure Decimal for financial use: enough precision, round half-up
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Shorthand: wrap a number (or string/Decimal) as Decimal. */
export function D(n: number | string | Decimal): Decimal {
  return new Decimal(n);
}

/** Multiply two or more values with full precision. */
export function dMul(...args: (number | Decimal)[]): Decimal {
  return args.reduce<Decimal>((acc, v) => acc.mul(v), D(1));
}

/** Divide a by b with full precision. Returns 0 if b is zero. */
export function dDiv(a: number | Decimal, b: number | Decimal): Decimal {
  const divisor = D(b);
  if (divisor.isZero()) return D(0);
  return D(a).div(divisor);
}

/** Add two or more values with full precision. */
export function dAdd(...args: (number | Decimal)[]): Decimal {
  return args.reduce<Decimal>((acc, v) => acc.plus(v), D(0));
}

/** Subtract b from a with full precision. */
export function dSub(a: number | Decimal, b: number | Decimal): Decimal {
  return D(a).minus(b);
}

/** Sum an array of numbers with full precision, returning a number. */
export function dSum(values: number[]): number {
  return values
    .reduce<Decimal>((acc, v) => acc.plus(v), D(0))
    .toNumber();
}

/** Round to 2 decimal places using Decimal (round half away from zero). */
export function dRound2(n: number | Decimal): number {
  return D(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** Raise base to the power of exp with full precision. */
export function dPow(base: number | Decimal, exp: number | Decimal): Decimal {
  return D(base).pow(exp);
}

/** Convert a Decimal to a plain number. */
export function dNum(d: Decimal): number {
  return d.toNumber();
}

/** Check if a Decimal value is zero. */
export function dIsZero(n: number | Decimal): boolean {
  return D(n).isZero();
}

/** Get the absolute value. */
export function dAbs(n: number | Decimal): Decimal {
  return D(n).abs();
}

/** Max of two values. */
export function dMax(a: number | Decimal, b: number | Decimal): Decimal {
  return Decimal.max(D(a), D(b));
}

export { Decimal };
