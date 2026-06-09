/**
 * FMT-2: valueAtMonth — safe single-month read from a MonthlySeries; returns 0
 * when the month is absent (or the value is nullish) so callers never propagate
 * `undefined`.
 */

import { describe, it, expect } from "vitest";
import { valueAtMonth, type MonthlySeries } from "../utils";

describe("valueAtMonth (FMT-2)", () => {
  it("returns the value when the month is present", () => {
    const s: MonthlySeries = new Map([
      ["2026-01", 100],
      ["2026-02", 250.5],
    ]);
    expect(valueAtMonth(s, "2026-01")).toBe(100);
    expect(valueAtMonth(s, "2026-02")).toBe(250.5);
  });

  it("returns 0 when the month is absent", () => {
    const s: MonthlySeries = new Map([["2026-01", 100]]);
    expect(valueAtMonth(s, "2026-03")).toBe(0);
  });

  it("returns 0 on an empty series", () => {
    expect(valueAtMonth(new Map(), "2026-01")).toBe(0);
  });

  it("preserves a real 0 (does not conflate with absent)", () => {
    const s: MonthlySeries = new Map([["2026-01", 0]]);
    expect(valueAtMonth(s, "2026-01")).toBe(0);
  });
});
