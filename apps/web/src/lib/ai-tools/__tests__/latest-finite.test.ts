/**
 * Task 6.8 (cleanup) — `latest()` must not surface a non-finite dark-metric
 * value to the AI/genui consumers.
 *
 * Dark/gated metrics (cac with no acquisitionSpend, ltvCacRatio inheriting it,
 * ltv with non-positive churn, magicNumber with no prior-quarter spend) arrive
 * from the engine as NaN. `latest()` is the shared read for the genui
 * `show_metric_card`/`show_kpi_grid` handlers (genui-display.ts) and the
 * analytics `get_financial_metrics` / `benchmark_against_peers` payloads
 * (analytics.ts). Returning a raw NaN leaks "NaN" into a `metric_card` prop or
 * an analytics JSON field — a wrong number the model will read as real.
 *
 * The fix coerces non-finite values to null (the same convention every other
 * consumer — metricValueAtMonth in context.ts — already uses, Phase 5 §5.6) so
 * downstream "n/a"/null handling drops the metric instead of asserting it.
 */
import { describe, it, expect } from "vitest";
import { latest } from "../types";

describe("Task 6.8 — latest() coerces non-finite dark metrics to null", () => {
  it("returns null for a trailing NaN (dark cac), never NaN", () => {
    const series = [
      { month: "2026-05", value: NaN },
      { month: "2026-06", value: NaN },
    ];
    expect(latest(series)).toBeNull();
  });

  it("returns null for Infinity (e.g. zero-churn LTV before the engine gate)", () => {
    expect(latest([{ month: "2026-06", value: Infinity }])).toBeNull();
  });

  it("returns the finite value unchanged (control)", () => {
    expect(latest([{ month: "2026-06", value: 600 }])).toBe(600);
    expect(latest([{ month: "2026-06", value: 0 }])).toBe(0);
  });

  it("still returns null for empty / undefined input", () => {
    expect(latest([])).toBeNull();
    expect(latest(undefined)).toBeNull();
  });
});
