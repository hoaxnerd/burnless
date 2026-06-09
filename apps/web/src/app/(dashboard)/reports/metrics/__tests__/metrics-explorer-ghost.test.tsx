/**
 * Phase 5 Task 5.7 — ghost NaN dark metrics in the metrics explorer.
 *
 * A NaN-gated metric (e.g. `cac` with no acquisitionSpend) must render the
 * em-dash ghost "—" instead of "$NaN" or a misleading "$0", and must skip the
 * trend indicator + expanded chart for that metric. `value ?? 0` does NOT
 * catch NaN (NaN is neither null nor undefined), so the fix gates on
 * Number.isFinite(rawCurrent).
 *
 * M3 (review) — NaN survives the unstable_cache JSON round-trip: the whole
 * NaN-gating strategy relies on JSON.stringify(NaN) === "null" and then
 * Number.isFinite(null) === false, so a cached NaN metric STILL ghosts.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ComputedMetrics, MetricValue } from "@burnless/engine";

// Charts are lazy recharts widgets; stub so the explorer mounts cleanly in
// happy-dom. The stub renders an identifiable marker so we can assert the
// expanded chart is (or is not) present.
vi.mock("@/components/charts", () => ({
  AreaChartWidget: () => <div data-testid="area-chart" />,
  chartColors: { brand: "#000", success: "#000", warning: "#000", info: "#000" },
  formatPercent: (v: number) => `${v.toFixed(1)}%`,
  formatNumber: (v: number) => String(v),
}));

vi.mock("@/components/reports/export-dropdown", () => ({
  ExportDropdown: () => <div data-testid="export-dropdown" />,
}));

vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    // Mirror Intl behaviour: a NaN amount would format to "$NaN" here, which
    // is exactly the wrong output the ghost fix must avoid.
    fmtCurrency: (n: number) => `$${Number.isNaN(n) ? "NaN" : n}`,
  }),
}));

import { MetricsExplorer } from "../metrics-explorer";

const MONTH = "2026-06";
const PREV = "2026-05";

/**
 * Build a minimal ComputedMetrics where every metric is a 2-point series.
 * `cac` is NaN at the current month (the dark/gated case); everything else is
 * a finite number so only the gated card should ghost.
 */
function buildMetrics(cacCurrent: number): ComputedMetrics {
  const finite = (v: number): MetricValue[] => [
    { month: PREV, value: v },
    { month: MONTH, value: v },
  ];
  const cacSeries: MetricValue[] = [
    { month: PREV, value: cacCurrent },
    { month: MONTH, value: cacCurrent },
  ];
  // Every key the explorer reads. Use a Proxy-free explicit object built from
  // the keys list to keep TS honest.
  const base = {
    mrr: finite(1000), arr: finite(12000), totalRevenue: finite(1000),
    revenueRunRate: finite(12000), newMrr: finite(100), expansionMrr: finite(50),
    churnedMrr: finite(20), netNewMrr: finite(130),
    totalCustomers: finite(10), newCustomersPerMonth: finite(2),
    churnedCustomersPerMonth: finite(1), customerChurnRate: finite(5),
    revenueChurnRate: finite(4), arpa: finite(100), ltv: finite(2000),
    cac: cacSeries, ltvCacRatio: finite(3), cacPaybackMonths: finite(6),
    saasQuickRatio: finite(4), magicNumber: finite(0.8),
    burnRate: finite(5000), netBurnRate: finite(4000), cashRunwayMonths: finite(12),
    cashPosition: finite(50000),
    grossProfit: finite(800), grossMarginPercent: finite(80),
    operatingIncome: finite(200), netIncome: finite(150), ebitda: finite(250),
    revenueGrowthRate: finite(10), mrrGrowthRate: finite(8),
    customerGrowthRate: finite(5), revenuePerEmployee: finite(120000),
    burnMultiple: finite(2), ruleOf40: finite(45),
  };
  return base as unknown as ComputedMetrics;
}

describe("Phase 5 §5.7 — metrics explorer ghosts NaN dark metrics", () => {
  it("renders '—' for a NaN cac, never '$NaN' or '$0'", () => {
    const { container, getByText } = render(
      <MetricsExplorer metrics={buildMetrics(NaN)} currentMonth={MONTH} />,
    );
    const html = container.innerHTML;
    expect(html).not.toContain("$NaN");

    // Locate the CAC card by its label, then assert its value cell shows the
    // em-dash ghost (not $0).
    const cacLabel = getByText("CAC");
    const card = cacLabel.closest("button")!;
    expect(card.textContent).toContain("—"); // em-dash
    expect(card.textContent).not.toContain("$0");
  });

  it("does NOT ghost a finite cac (control)", () => {
    const { getByText } = render(
      <MetricsExplorer metrics={buildMetrics(600)} currentMonth={MONTH} />,
    );
    const card = getByText("CAC").closest("button")!;
    expect(card.textContent).toContain("$600");
    expect(card.textContent).not.toContain("—");
  });

  it("M3 — NaN survives the unstable_cache JSON round-trip and STILL ghosts", () => {
    // unstable_cache JSON-stringifies the computed metrics. JSON drops NaN to
    // null; the gate is Number.isFinite, which is false for null too, so the
    // metric still ghosts after a cache hit.
    expect(JSON.stringify(NaN)).toBe("null");
    const roundTripped = JSON.parse(JSON.stringify({ value: NaN })) as { value: number | null };
    expect(roundTripped.value).toBeNull();
    expect(Number.isFinite(roundTripped.value)).toBe(false);

    // Render with the cache-shaped value (null instead of NaN): same ghost.
    const metrics = buildMetrics(NaN);
    const cac = (metrics as unknown as Record<string, MetricValue[]>).cac!;
    // Simulate post-cache shape: NaN became null.
    cac[0] = { month: PREV, value: null as unknown as number };
    cac[1] = { month: MONTH, value: null as unknown as number };

    const { getByText, container } = render(
      <MetricsExplorer metrics={metrics} currentMonth={MONTH} />,
    );
    expect(container.innerHTML).not.toContain("$NaN");
    const card = getByText("CAC").closest("button")!;
    expect(card.textContent).toContain("—");
    expect(card.textContent).not.toContain("$0");
  });
});
