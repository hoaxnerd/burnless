/**
 * Tests for chart axis formatter — guards against digit-concatenation bugs.
 *
 * [Phase 4 E Task 7] QA on /revenue showed Y-axis labels like "4120k" instead
 * of "520k". Root cause: formatCompactCurrency(value, currency, locale) was
 * passed directly as a Recharts tickFormatter. Recharts calls
 * tickFormatter(value, index) — passing the tick index (0, 1, 2, …) as the
 * second arg, which landed in the `currency` parameter. When the index is not
 * a valid CurrencyCode, CURRENCIES[index] is undefined, so `symbol` falls back
 * to the raw index number, which gets prepended to the formatted value:
 * e.g. formatCompactCurrency(520_000, 4) → "4520k".
 *
 * The fix: wrap in an arrow function `(v) => formatCompactCurrency(v)` so that
 * Recharts' second argument (index) is ignored.
 */

import { describe, it, expect } from "vitest";
import { formatCompactCurrency } from "../chart-theme";

describe("formatCompactCurrency (Phase 4 E Task 7)", () => {
  it("formats 120000 as '$120k'", () => {
    expect(formatCompactCurrency(120_000)).toBe("$120k");
  });

  it("formats 4000000 as '$4.0M'", () => {
    expect(formatCompactCurrency(4_000_000)).toBe("$4.0M");
  });

  it("formats 0 as '$0'", () => {
    expect(formatCompactCurrency(0)).toBe("$0");
  });

  it("ignores a numeric second argument (Recharts tick index) — no digit concat", () => {
    // Simulate Recharts calling tickFormatter(value, index)
    // formatCompactCurrency must only use the value, not the index
    const ticks = [0, 130_000, 260_000, 390_000, 520_000];
    for (let index = 0; index < ticks.length; index++) {
      // Call with explicit numeric index as second arg (like Recharts does)
      // TypeScript won't catch this at runtime when passed via a callback
      const result = (formatCompactCurrency as (v: number, idx: unknown) => string)(
        ticks[index]!,
        index
      );
      // Must not contain 4+ digit runs (catches "4120" before "k")
      expect(result, `tick index=${index}, value=${ticks[index]}`).not.toMatch(/\d{4,}/);
      // Must start with "$" (symbol must not be a digit)
      expect(result, `tick index=${index}, value=${ticks[index]}`).toMatch(/^\$/);
    }
  });

  it("formats round-trip values without concatenation artifacts", () => {
    const values = [120_000, 260_000, 390_000, 520_000];
    const formatted = values.map((v) => formatCompactCurrency(v));
    for (const f of formatted) {
      expect(f).not.toMatch(/\d{4,}/); // no 4+ digit runs
    }
  });
});
