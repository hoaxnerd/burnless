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
import {
  formatCompactCurrency,
  shouldShowYearInTicks,
  makeMonthTickFormatter,
} from "../chart-theme";

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

// ── SCN-06: explicit ticks — formatter applied to every month ─────────────────

describe("makeMonthTickFormatter (SCN-06: all ticks present)", () => {
  it("produces a label for all 12 months of a single year (no auto-skip in our formatter)", () => {
    const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`);
    const fmt = makeMonthTickFormatter(months);
    const labels = months.map((m) => fmt(m));
    // Every month renders a non-empty label (Nov included — SCN-06 root issue).
    expect(labels).toHaveLength(12);
    for (const l of labels) expect(l.length).toBeGreaterThan(0);
    // Single-year window keeps the SHORT month form (no year digits).
    expect(fmt("2025-11")).toBe("Nov");
    for (const l of labels) expect(l).not.toMatch(/\d{2,}/);
  });
});

// ── RPT-09: year-in-label disambiguation across a year boundary ───────────────

describe("shouldShowYearInTicks / makeMonthTickFormatter (RPT-09: distinct labels)", () => {
  it("does not show year for a single-year window", () => {
    const months = ["2025-01", "2025-06", "2025-12"];
    expect(shouldShowYearInTicks(months)).toBe(false);
  });

  it("shows year when the window crosses a calendar year boundary", () => {
    const months = ["2025-11", "2025-12", "2026-01"];
    expect(shouldShowYearInTicks(months)).toBe(true);
  });

  it("shows year when the window spans more than 12 months", () => {
    const months = Array.from({ length: 14 }, (_, i) => {
      const total = 10 + i; // 2025-11 .. 2026-12 (offset)
      const year = 2025 + Math.floor(total / 12);
      const month = (total % 12) + 1;
      return `${year}-${String(month).padStart(2, "0")}`;
    });
    expect(shouldShowYearInTicks(months)).toBe(true);
  });

  it("renders DISTINCT labels for 2025-11..2026-12 (Nov-25 vs Nov-26 no longer identical)", () => {
    const months: string[] = [];
    // 2025-11, 2025-12, then 2026-01 .. 2026-12
    months.push("2025-11", "2025-12");
    for (let m = 1; m <= 12; m++) months.push(`2026-${String(m).padStart(2, "0")}`);

    const fmt = makeMonthTickFormatter(months);
    const labels = months.map((m) => fmt(m));

    // The two November ticks must differ once year is included.
    expect(fmt("2025-11")).not.toBe(fmt("2026-11"));
    // All labels are unique across the multi-year window.
    expect(new Set(labels).size).toBe(labels.length);
    // Year is present in multi-year labels.
    expect(fmt("2025-11")).toMatch(/25/);
    expect(fmt("2026-11")).toMatch(/26/);
  });
});
