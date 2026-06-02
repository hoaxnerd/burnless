import { describe, it, expect, vi } from "vitest";

vi.mock("../../compute-dashboard", () => ({
  // Default ("s1") dashboard. The scenario_diff test uses a second scenario
  // ("s2") whose totals differ — the mock branches on the scenarioId arg so the
  // engine diff produces non-zero deltas without disturbing the other tests.
  computeDashboardData: vi.fn(async (_companyId: string, scenarioId: string) => {
    if (scenarioId === "s2") {
      return {
        metrics: {
          cashRunwayMonths: [{ month: "2026-06", value: 9.5 }],
          netBurnRate: [{ month: "2026-06", value: 95000 }],
          mrr: [{ month: "2026-06", value: 60000 }],
        },
        totalRevenue: new Map([
          ["2026-05", 58000],
          ["2026-06", 60000],
        ]),
        totalExpenses: new Map([
          ["2026-05", 150000],
          ["2026-06", 155000],
        ]),
        netIncome: new Map([
          ["2026-05", -92000],
          ["2026-06", -95000],
        ]),
        cashPosition: new Map([
          ["2026-05", 700000],
          ["2026-06", 605000],
        ]),
        headcountSeries: new Map([
          ["2026-05", 12],
          ["2026-06", 14],
        ]),
        headcountCostSeries: new Map([
          ["2026-05", 140000],
          ["2026-06", 150000],
        ]),
      };
    }
    return {
      metrics: {
        cashRunwayMonths: [{ month: "2026-06", value: 14.2 }],
        netBurnRate: [
          { month: "2026-04", value: 80000 },
          { month: "2026-05", value: 81000 },
          { month: "2026-06", value: 82000 },
        ],
        mrr: [
          { month: "2026-04", value: 46000 },
          { month: "2026-05", value: 48000 },
          { month: "2026-06", value: 50000 },
        ],
      },
      // Top-level MonthlySeries (Map<"YYYY-MM", number>) — what computeDashboardData
      // really returns for revenue/cash/headcount cost.
      totalRevenue: new Map([
        ["2026-01", 40000],
        ["2026-02", 42000],
        ["2026-03", 44000],
        ["2026-04", 46000],
        ["2026-05", 48000],
        ["2026-06", 50000],
      ]),
      totalExpenses: new Map([
        ["2026-05", 129000],
        ["2026-06", 132000],
      ]),
      netIncome: new Map([
        ["2026-05", -81000],
        ["2026-06", -82000],
      ]),
      cashPosition: new Map([
        ["2026-05", 900000],
        ["2026-06", 818000],
      ]),
      headcountSeries: new Map([
        ["2026-05", 10],
        ["2026-06", 11],
      ]),
      headcountCostSeries: new Map([
        ["2026-05", 120000],
        ["2026-06", 130000],
      ]),
      // Per-revenue-type breakdown (RevenueByType) — each value a MonthlySeries Map.
      revenueByType: {
        subscriptionRevenue: new Map([
          ["2026-05", 40000],
          ["2026-06", 42000],
        ]),
        oneTimeRevenue: new Map([["2026-06", 5000]]),
        usageRevenue: new Map([["2026-06", 3000]]),
        servicesRevenue: new Map(),
        marketplaceRevenue: new Map(),
        ecommerceRevenue: new Map(),
        hardwareRevenue: new Map(),
      },
    };
  }),
}));
vi.mock("@burnless/db", () => ({
  getScenarioForCompany: vi.fn(async (scenarioId: string) => ({
    id: scenarioId,
    name: scenarioId === "s2" ? "Aggressive hiring" : "Base plan",
  })),
}));
vi.mock("../../compute-expenses", () => ({
  computeExpenseDetails: vi.fn(async () => ({
    subcategoryBreakdown: [
      { subcategory: "Payroll", amount: 90000 },
      { subcategory: "Marketing", amount: 25000 },
      { subcategory: "Software", amount: 12000 },
    ],
  })),
}));
vi.mock("../../data", () => ({
  getDefaultScenario: vi.fn(async () => ({ id: "s1" })),
}));
vi.mock("../../compute-cap-table", () => ({
  computeCapTableForCompany: vi.fn(async () => ({
    rows: [
      { holder: "Founders", shareClass: "Common", shares: 8_000_000, ownershipPercent: 0.8 },
      { holder: "Series A", shareClass: "Preferred", shares: 1_500_000, ownershipPercent: 0.15 },
      { holder: "Option pool", shareClass: "Options", shares: 500_000, ownershipPercent: 0.05 },
    ],
    totalFullyDiluted: 10_000_000,
    totals: {
      commonStock: 8_000_000,
      preferredStock: 1_500_000,
      safeOverhang: 0,
      optionPoolOverhang: 500_000,
    },
  })),
}));

import { genuiDisplayHandlers } from "../genui-display";

const ctx = { companyId: "c1", scenarioId: "s1", userId: "u1" };

describe("show_metric_card", () => {
  it("returns a metric_card render envelope with the real runway value", async () => {
    const out = await genuiDisplayHandlers.show_metric_card!({ metric: "runway" }, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("metric_card");
    expect(parsed.render.props.value).toBe(14.2);
    expect(parsed.render.props.format).toBe("number");
    expect(parsed.render.props.label).toBe("Runway");
    expect(parsed.render.props.unit).toBe("months");
    expect(parsed.modelResult).toMatch(/metric_card/);
  });

  it("returns a currency metric_card for net burn", async () => {
    const out = await genuiDisplayHandlers.show_metric_card!({ metric: "net_burn" }, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("metric_card");
    expect(parsed.render.props.value).toBe(82000);
    expect(parsed.render.props.format).toBe("currency");
  });
});

describe("show_line_chart", () => {
  it("returns a line_chart envelope with real revenue data trimmed to `months`", async () => {
    const out = await genuiDisplayHandlers.show_line_chart!(
      { series: "revenue", months: 3 },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("line_chart");
    expect(parsed.render.props.format).toBe("currency");
    // Trimmed to the last 3 months of the 6-month series.
    expect(parsed.render.props.data).toHaveLength(3);
    expect(parsed.render.props.data[parsed.render.props.data.length - 1]).toEqual({
      month: "2026-06",
      value: 50000,
    });
    expect(parsed.render.props.lines).toHaveLength(1);
    expect(parsed.render.props.lines[0].dataKey).toBe("value");
    expect(parsed.render.props.lines[0].label).toBe("Revenue");
    expect(parsed.modelResult).toMatch(/line_chart/);
  });

  it("defaults to revenue over 12 months and never returns more than `months` points", async () => {
    const out = await genuiDisplayHandlers.show_line_chart!({}, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("line_chart");
    expect(parsed.render.props.lines[0].label).toBe("Revenue");
    expect(parsed.render.props.data.length).toBeLessThanOrEqual(12);
    expect(parsed.render.props.data.length).toBeGreaterThan(0);
  });

  it("pulls a metric series (mrr) for the chart", async () => {
    const out = await genuiDisplayHandlers.show_line_chart!({ series: "mrr", months: 12 }, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.props.lines[0].label).toBe("MRR");
    expect(parsed.render.props.data[parsed.render.props.data.length - 1]).toEqual({
      month: "2026-06",
      value: 50000,
    });
  });
});

describe("show_bar_chart", () => {
  it("returns a bar_chart envelope of real expense category totals", async () => {
    const out = await genuiDisplayHandlers.show_bar_chart!(
      { dimension: "expense_by_category" },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("bar_chart");
    expect(parsed.render.props.format).toBe("currency");
    expect(parsed.render.props.data.length).toBeGreaterThanOrEqual(1);
    // Each datum is { label, value } from subcategoryBreakdown.
    expect(parsed.render.props.data[0]).toEqual({ label: "Payroll", value: 90000 });
    expect(parsed.render.props.bars).toHaveLength(1);
    expect(parsed.render.props.bars[0].dataKey).toBe("value");
    expect(typeof parsed.render.props.bars[0].color).toBe("string");
    expect(parsed.modelResult).toMatch(/bar_chart/);
  });

  it("returns a bar_chart envelope of revenue grouped by stream type", async () => {
    const out = await genuiDisplayHandlers.show_bar_chart!(
      { dimension: "revenue_by_stream" },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("bar_chart");
    expect(parsed.render.props.format).toBe("currency");
    // Only non-zero revenue types appear; subscription sums 40000+42000=82000.
    const sub = parsed.render.props.data.find(
      (d: { label: string; value: number }) => d.label === "Subscription"
    );
    expect(sub).toBeTruthy();
    expect(sub.value).toBe(82000);
    expect(parsed.render.props.bars[0].dataKey).toBe("value");
  });

  it("defaults to expense_by_category when dimension is omitted", async () => {
    const out = await genuiDisplayHandlers.show_bar_chart!({}, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("bar_chart");
    expect(parsed.render.props.data[0].label).toBe("Payroll");
  });
});

describe("show_kpi_grid", () => {
  it("returns a kpi_grid envelope with real values for each requested metric", async () => {
    const out = await genuiDisplayHandlers.show_kpi_grid!(
      { metrics: ["runway", "mrr"] },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("kpi_grid");
    expect(parsed.render.props.items).toHaveLength(2);
    const runway = parsed.render.props.items.find(
      (i: { label: string }) => i.label === "Runway"
    );
    const mrr = parsed.render.props.items.find(
      (i: { label: string }) => i.label === "MRR"
    );
    expect(runway).toEqual({ label: "Runway", value: 14.2, format: "number", unit: "months" });
    expect(mrr.value).toBe(50000);
    expect(mrr.format).toBe("currency");
    expect(parsed.modelResult).toMatch(/kpi_grid/);
  });

  it("preserves the requested metric order and skips unknown metrics", async () => {
    const out = await genuiDisplayHandlers.show_kpi_grid!(
      { metrics: ["mrr", "net_burn"] },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.props.items.map((i: { label: string }) => i.label)).toEqual([
      "MRR",
      "Net burn",
    ]);
    expect(parsed.render.props.items[1].value).toBe(82000);
  });
});

describe("show_area_chart", () => {
  it("returns an area_chart of the cash position series (cash_runway)", async () => {
    const out = await genuiDisplayHandlers.show_area_chart!(
      { series: "cash_runway", months: 18 },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("area_chart");
    expect(parsed.render.props.format).toBe("currency");
    // Two cash points in the mock, chronologically sorted.
    expect(parsed.render.props.data).toEqual([
      { month: "2026-05", value: 900000 },
      { month: "2026-06", value: 818000 },
    ]);
    expect(typeof parsed.render.props.color).toBe("string");
    expect(parsed.modelResult).toMatch(/area_chart/);
  });

  it("returns a monotonically increasing cumulative revenue series", async () => {
    const out = await genuiDisplayHandlers.show_area_chart!(
      { series: "cumulative_revenue", months: 12 },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("area_chart");
    const data = parsed.render.props.data as Array<{ month: string; value: number }>;
    // Running sum of totalRevenue: 40000, 82000, 126000, 172000, 220000, 270000.
    expect(data[0]).toEqual({ month: "2026-01", value: 40000 });
    expect(data[data.length - 1]).toEqual({ month: "2026-06", value: 270000 });
    // Cumulative sum is non-decreasing.
    for (let i = 1; i < data.length; i++) {
      expect(data[i]!.value).toBeGreaterThanOrEqual(data[i - 1]!.value);
    }
    // Months stay chronologically ordered.
    for (let i = 1; i < data.length; i++) {
      expect(data[i]!.month > data[i - 1]!.month).toBe(true);
    }
  });

  it("trims cumulative revenue to the last `months` points", async () => {
    const out = await genuiDisplayHandlers.show_area_chart!(
      { series: "cumulative_revenue", months: 2 },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.props.data).toHaveLength(2);
    // Last two cumulative points are preserved.
    expect(parsed.render.props.data[1]).toEqual({ month: "2026-06", value: 270000 });
  });

  it("defaults to cash_runway over 18 months", async () => {
    const out = await genuiDisplayHandlers.show_area_chart!({}, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("area_chart");
    expect(parsed.render.props.data[0].month).toBe("2026-05");
  });
});

describe("show_runway", () => {
  it("returns a runway envelope with real runway, burn, cash, and a derived cash-out month", async () => {
    const out = await genuiDisplayHandlers.show_runway!({}, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("runway");
    // Latest cashRunwayMonths from the mock.
    expect(parsed.render.props.runwayMonths).toBe(14.2);
    // Latest netBurnRate from the mock.
    expect(parsed.render.props.netBurn).toBe(82000);
    // Latest cashPosition value from the mock Map.
    expect(parsed.render.props.cash).toBe(818000);
    // Cash-out = latest cash month (2026-06) + ceil(14.2)=15 months → 2027-09.
    expect(parsed.render.props.zeroCashMonth).toBe("2027-09");
    expect(parsed.render.props.format).toBe("currency");
    expect(parsed.modelResult).toMatch(/runway/);
  });
});

describe("show_cap_table", () => {
  it("returns a cap_table envelope with rows summing to ~100% and total shares", async () => {
    const out = await genuiDisplayHandlers.show_cap_table!({}, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("cap_table");
    expect(parsed.render.props.totalShares).toBe(10_000_000);
    expect(parsed.render.props.rows).toHaveLength(3);
    // ownershipPercent (0-1 from the engine) is mapped to 0-100 for the percent formatter.
    const founders = parsed.render.props.rows.find(
      (r: { holder: string }) => r.holder === "Founders"
    );
    expect(founders).toEqual({
      holder: "Founders",
      shares: 8_000_000,
      pctOwnership: 80,
      shareClass: "Common",
    });
    // Percentages sum to ~100.
    const totalPct = parsed.render.props.rows.reduce(
      (s: number, r: { pctOwnership: number }) => s + r.pctOwnership,
      0
    );
    expect(totalPct).toBeCloseTo(100, 5);
    expect(parsed.modelResult).toMatch(/cap_table/);
  });
});

describe("show_burn_breakdown", () => {
  it("emits a bar_chart envelope of real latest-month expense categories", async () => {
    const out = await genuiDisplayHandlers.show_burn_breakdown!({}, ctx);
    const parsed = JSON.parse(out);
    // Reuses the bar_chart renderer — the component name is "bar_chart".
    expect(parsed.render.component).toBe("bar_chart");
    expect(parsed.render.props.title).toBe("Burn breakdown");
    expect(parsed.render.props.format).toBe("currency");
    expect(parsed.render.props.data.length).toBeGreaterThanOrEqual(1);
    // Each datum is { label, value } sourced from subcategoryBreakdown.
    expect(parsed.render.props.data[0]).toEqual({ label: "Payroll", value: 90000 });
    expect(parsed.render.props.bars).toHaveLength(1);
    expect(parsed.render.props.bars[0].dataKey).toBe("value");
    expect(typeof parsed.render.props.bars[0].color).toBe("string");
    expect(parsed.modelResult).toMatch(/burn_breakdown/);
  });
});

describe("show_scenario_diff", () => {
  it("returns a scenario_diff envelope with both names and real per-metric deltas", async () => {
    const out = await genuiDisplayHandlers.show_scenario_diff!(
      { scenarioA: "s1", scenarioB: "s2" },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("scenario_diff");
    expect(parsed.render.props.aName).toBe("Base plan");
    expect(parsed.render.props.bName).toBe("Aggressive hiring");

    const rows = parsed.render.props.rows as Array<{
      label: string;
      a: number;
      b: number;
      delta: number;
      format: string;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Revenue row uses the latest-month values from each scenario.
    const revenue = rows.find((r) => r.label === "Revenue");
    expect(revenue).toBeTruthy();
    expect(revenue!.a).toBe(50000);
    expect(revenue!.b).toBe(60000);
    expect(revenue!.delta).toBe(10000);
    expect(revenue!.format).toBe("currency");

    // Headcount uses the number format (not currency).
    const headcount = rows.find((r) => r.label === "Headcount");
    expect(headcount).toBeTruthy();
    expect(headcount!.a).toBe(11);
    expect(headcount!.b).toBe(14);
    expect(headcount!.delta).toBe(3);
    expect(headcount!.format).toBe("number");

    expect(parsed.modelResult).toMatch(/scenario_diff/);
  });
});
