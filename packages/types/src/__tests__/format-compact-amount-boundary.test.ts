/**
 * Guard test [RPT-07] — compact amount formatter must not emit "$1000k".
 *
 * Bug: formatCompactAmount uses `(abs/1000).toFixed(0)` for the k-tier. A value
 * in [999_500, 999_999] is below the 1_000_000 threshold so it takes the k-tier,
 * and `(999500/1000).toFixed(0)` rounds 999.5 → '1000', producing '$1000k'
 * instead of promoting to the M-tier ('$1.0M'). LTV lands just under $1M and
 * hits this boundary. The k-tier also truncates fractional thousands
 * ('1500' → '$2k' instead of '$1.5k').
 *
 * Assertions encode the FIXED behavior, so this is RED now and GREEN after the
 * boundary fix (promote-to-M + fractional-k).
 */

import { describe, it, expect } from "vitest";
import { formatCompactAmount } from "../index";

describe("formatCompactAmount — k/M boundary rollover (RPT-07)", () => {
  it("999_500 rolls up to '$1.0M' (never '$1000k')", () => {
    const out = formatCompactAmount(999_500, "USD");
    expect(out, `formatCompactAmount(999_500,'USD') => ${out}`).not.toContain("1000k");
    expect(out).toBe("$1.0M");
  });

  it("999_999 rolls up to '$1.0M' (never '$1000k')", () => {
    const out = formatCompactAmount(999_999, "USD");
    expect(out, `formatCompactAmount(999_999,'USD') => ${out}`).not.toContain("1000k");
    expect(out).toBe("$1.0M");
  });

  it("1_000_000 formats as '$1.0M'", () => {
    expect(formatCompactAmount(1_000_000, "USD")).toBe("$1.0M");
  });

  it("1_500 formats as '$1.5k' (fractional thousands preserved)", () => {
    const out = formatCompactAmount(1_500, "USD");
    expect(out, `formatCompactAmount(1_500,'USD') => ${out}`).toBe("$1.5k");
  });

  it("no value in the k-tier ever produces a '$1000k'-style output", () => {
    const offenders: string[] = [];
    for (const v of [999_500, 999_900, 999_999, 1_000_000, 1_500, 12_345]) {
      const out = formatCompactAmount(v, "USD");
      if (/1000k/.test(out)) offenders.push(`${v} => ${out}`);
    }
    expect(offenders, `'$1000k'-style outputs found:\n${offenders.join("\n")}`).toEqual([]);
  });
});
