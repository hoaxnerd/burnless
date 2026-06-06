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
      // P&L statement — each line a StatementLineItem { name, values:[{month,value}] }.
      profitAndLoss: {
        revenue: { name: "Revenue", values: [{ month: "2026-05", value: 48000 }, { month: "2026-06", value: 50000 }] },
        cogs: { name: "COGS", values: [{ month: "2026-06", value: 8000 }] },
        grossProfit: { name: "Gross profit", values: [{ month: "2026-06", value: 42000 }] },
        operatingExpenses: { name: "Operating expenses", values: [{ month: "2026-06", value: 124000 }] },
        operatingIncome: { name: "Operating income", values: [{ month: "2026-06", value: -82000 }] },
        otherIncome: { name: "Other income", values: [] },
        otherExpenses: { name: "Other expenses", values: [] },
        netIncome: { name: "Net income", values: [{ month: "2026-06", value: -82000 }] },
        grossMargin: [{ month: "2026-06", value: 84 }],
        netMargin: [{ month: "2026-06", value: -164 }],
      },
      // Per-revenue-type breakdown (RevenueByType) — each value a MonthlySeries Map.
      // revenueByType: no longer read by handlers (revenue_by_stream now uses revenueLines/revenueResidual); kept for shape fidelity.
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
      // Blended, reconciled per-stream revenue lines + the residual + current month.
      // At currentMonth (2026-06): two subscription streams (30000 + 12000) + one
      // services stream (3000) = 45000 of named-stream revenue; residual 5000 of
      // imported revenue; Σ = 50000 = totalRevenue.get("2026-06"). Reconciles.
      currentMonth: "2026-06",
      revenueLines: [
        {
          streamId: "r1",
          name: "Pro plan",
          type: "subscription",
          values: new Map([
            ["2026-05", 28000],
            ["2026-06", 30000],
          ]),
        },
        {
          streamId: "r2",
          name: "Team plan",
          type: "subscription",
          values: new Map([
            ["2026-05", 11000],
            ["2026-06", 12000],
          ]),
        },
        {
          streamId: "r3",
          name: "Consulting",
          type: "services",
          values: new Map([["2026-06", 3000]]),
        },
      ],
      revenueResidual: new Map([
        ["2026-05", 9000],
        ["2026-06", 5000],
      ]),
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
  // Scenario-aware funding rounds. `amount` arrives as a numeric string from the
  // DB driver — the handler must coerce it. Mixed historical + projected rounds.
  getFundingRounds: vi.fn(async () => [
    {
      name: "Seed",
      type: "seed",
      amount: "1500000.00",
      date: new Date("2024-03-01"),
      isProjected: false,
    },
    {
      name: "Series A",
      type: "series_a",
      amount: "8000000.00",
      date: new Date("2025-09-01"),
      isProjected: false,
    },
    {
      name: "Series B (planned)",
      type: "series_b",
      amount: "20000000.00",
      date: new Date("2027-01-01"),
      isProjected: true,
    },
  ]),
}));
vi.mock("../../compute-revenue", () => ({
  computeRevenueDetails: vi.fn(async () => ({
    streamBreakdown: [
      { id: "r1", name: "Pro plan", type: "subscription", currentRevenue: 42000 },
      { id: "r2", name: "Consulting", type: "services", currentRevenue: 8000 },
    ],
  })),
}));
vi.mock("../../compute-cap-table", () => ({
  // Handler uses the UNCACHED inner compute (cache wrapper throws in SSE stream).
  computeCapTableInner: vi.fn(async () => ({
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

import { computeDashboardData } from "../../compute-dashboard";
import { computeCapTableInner } from "../../compute-cap-table";
import { getFundingRounds } from "../../data";
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

  it("returns a bar_chart of blended revenue grouped by type at the current month, reconciling to totalRevenue (incl. residual)", async () => {
    const out = await genuiDisplayHandlers.show_bar_chart!(
      { dimension: "revenue_by_stream" },
      ctx
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("bar_chart");
    expect(parsed.render.props.format).toBe("currency");

    const data = parsed.render.props.data as Array<{ label: string; value: number }>;
    // Current-month (2026-06) per-TYPE bars from the blended breakdown:
    //   Subscription = 30000 + 12000 = 42000
    //   Services     = 3000
    //   Imported / Other (residual) = 5000
    const sub = data.find((d) => d.label === "Subscription");
    expect(sub).toBeTruthy();
    expect(sub!.value).toBe(42000); // current month only, NOT summed across months
    const services = data.find((d) => d.label === "Services");
    expect(services!.value).toBe(3000);
    // Residual surfaces as its own bar.
    const imported = data.find((d) => d.label === "Imported / Other");
    expect(imported).toBeTruthy();
    expect(imported!.value).toBe(5000);

    // Reconciliation: Σ bars === totalRevenue at the current month (50000).
    const total = data.reduce((s, d) => s + d.value, 0);
    expect(total).toBe(50000);

    expect(parsed.render.props.bars[0].dataKey).toBe("value");
  });

  it("defaults to expense_by_category when dimension is omitted", async () => {
    const out = await genuiDisplayHandlers.show_bar_chart!({}, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("bar_chart");
    expect(parsed.render.props.data[0].label).toBe("Payroll");
  });
});

describe("scenario-arg guard (resolveScenarioId)", () => {
  it("pins data-bound display tools to the chat's active scenario, ignoring a model-supplied scenarioId", async () => {
    const mock = vi.mocked(computeDashboardData);
    mock.mockClear();
    // ctx.scenarioId is "s1"; the model passes scenarioId "s2". The active
    // scenario MUST win, or the rendered component diverges from the AI text.
    await genuiDisplayHandlers.show_metric_card!({ metric: "mrr", scenarioId: "s2" }, ctx);
    expect(mock).toHaveBeenCalledWith("c1", "s1");
    expect(mock).not.toHaveBeenCalledWith("c1", "s2");
  });

  it("pins show_cap_table (computeCapTableInner path) to the active scenario", async () => {
    const capMock = vi.mocked(computeCapTableInner);
    capMock.mockClear();
    // ctx.scenarioId is "s1"; the model passes "s2". The cap-table handler uses a
    // different compute path (computeCapTableInner) but the SAME resolver guard.
    await genuiDisplayHandlers.show_cap_table!({ scenarioId: "s2" }, ctx);
    expect(capMock).toHaveBeenCalledWith("c1", "s1");
    expect(capMock).not.toHaveBeenCalledWith("c1", "s2");
  });

  it("pins show_funding_summary (getFundingRounds path) to the active scenario", async () => {
    const fundingMock = vi.mocked(getFundingRounds);
    fundingMock.mockClear();
    // ctx.scenarioId is "s1"; the model passes "s2". The funding handler resolves
    // rounds via getFundingRounds(companyId, scenarioId) — the active scenario wins.
    await genuiDisplayHandlers.show_funding_summary!({ scenarioId: "s2" }, ctx);
    expect(fundingMock).toHaveBeenCalledWith("c1", "s1");
    expect(fundingMock).not.toHaveBeenCalledWith("c1", "s2");
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

describe("show_funding_summary", () => {
  it("returns a funding_summary envelope with totalRaised = sum of round amounts", async () => {
    const out = await genuiDisplayHandlers.show_funding_summary!({}, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("funding_summary");
    expect(parsed.render.props.format).toBe("currency");

    const rounds = parsed.render.props.rounds as Array<{
      name: string;
      type: string;
      amount: number;
      date: string;
      isProjected: boolean;
    }>;
    expect(rounds).toHaveLength(3);

    // Amounts coerced from numeric strings to numbers, ordered chronologically.
    expect(rounds[0]).toMatchObject({ name: "Seed", amount: 1_500_000, isProjected: false });
    expect(rounds[2]).toMatchObject({
      name: "Series B (planned)",
      amount: 20_000_000,
      isProjected: true,
    });

    // totalRaised = sum of all round amounts (1.5M + 8M + 20M).
    expect(parsed.render.props.totalRaised).toBe(29_500_000);
    expect(parsed.modelResult).toMatch(/funding_summary/);
  });

  it("flags projected rounds and reports the raised count in the model result", async () => {
    const out = await genuiDisplayHandlers.show_funding_summary!({}, ctx);
    const parsed = JSON.parse(out);
    const rounds = parsed.render.props.rounds as Array<{ isProjected: boolean }>;
    // Two historical (raised) rounds, one projected.
    expect(rounds.filter((r) => !r.isProjected)).toHaveLength(2);
    expect(rounds.filter((r) => r.isProjected)).toHaveLength(1);
    expect(parsed.modelResult).toMatch(/3 rounds/);
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

describe("show_data_table", () => {
  it("returns a data_table of the P&L summary with a revenue row and currency columns", async () => {
    const out = await genuiDisplayHandlers.show_data_table!({ dataset: "pl_summary" }, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("data_table");
    expect(parsed.render.props.title).toMatch(/P&L|summary/i);

    const columns = parsed.render.props.columns as Array<{ key: string; label: string; format?: string }>;
    expect(columns.length).toBeGreaterThanOrEqual(2);
    // An amount column routes numbers through the currency formatter.
    const amountCol = columns.find((c) => c.format === "currency");
    expect(amountCol).toBeTruthy();

    const rows = parsed.render.props.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // The Revenue line shows its latest-month value (50000 from the mock).
    const revenueRow = rows.find((r) => String(r[columns[0]!.key]).toLowerCase() === "revenue");
    expect(revenueRow).toBeTruthy();
    expect(revenueRow![amountCol!.key]).toBe(50000);
    expect(parsed.modelResult).toMatch(/data_table/);
  });

  it("returns a data_table of revenue streams with real per-stream amounts", async () => {
    const out = await genuiDisplayHandlers.show_data_table!({ dataset: "revenue_streams" }, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("data_table");
    const rows = parsed.render.props.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    const amountCol = (parsed.render.props.columns as Array<{ key: string; format?: string }>).find(
      (c) => c.format === "currency"
    )!;
    const pro = rows.find((r) => r.name === "Pro plan");
    expect(pro).toBeTruthy();
    expect(pro![amountCol.key]).toBe(42000);
  });

  it("returns a data_table of expense categories with real amounts", async () => {
    const out = await genuiDisplayHandlers.show_data_table!({ dataset: "expenses" }, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("data_table");
    const rows = parsed.render.props.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBe(3);
    const amountCol = (parsed.render.props.columns as Array<{ key: string; format?: string }>).find(
      (c) => c.format === "currency"
    )!;
    const payroll = rows.find((r) => String(Object.values(r)[0]) === "Payroll");
    expect(payroll).toBeTruthy();
    expect(payroll![amountCol.key]).toBe(90000);
  });

  it("defaults to the pl_summary dataset when none is given", async () => {
    const out = await genuiDisplayHandlers.show_data_table!({}, ctx);
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("data_table");
    expect(parsed.render.props.title).toMatch(/P&L|summary/i);
  });
});

describe("show_callout", () => {
  it("echoes model-authored content as props (no data access)", async () => {
    const out = await genuiDisplayHandlers.show_callout!(
      { severity: "warning", title: "Runway is short", body: "You have under 6 months." },
      { companyId: "c1", userId: "u1" }
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("callout");
    expect(parsed.render.props).toMatchObject({ severity: "warning", title: "Runway is short" });
    expect(parsed.modelResult).toMatch(/callout/);
  });
});

describe("show_comparison_table", () => {
  it("echoes model-authored columns and rows as props (no data access)", async () => {
    const out = await genuiDisplayHandlers.show_comparison_table!(
      {
        title: "Hire now vs in 6 months",
        columns: [
          { key: "factor", label: "Factor" },
          { key: "now", label: "Hire now" },
          { key: "later", label: "Hire in 6 months" },
        ],
        rows: [
          { factor: "Runway impact", now: "Shorter", later: "Preserved" },
          { factor: "Velocity", now: "Faster", later: "Slower" },
        ],
      },
      { companyId: "c1", userId: "u1" }
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("comparison_table");
    expect(parsed.render.props.title).toBe("Hire now vs in 6 months");
    expect(parsed.render.props.columns).toHaveLength(3);
    expect(parsed.render.props.columns[0]).toMatchObject({ key: "factor", label: "Factor" });
    expect(parsed.render.props.rows).toHaveLength(2);
    expect(parsed.render.props.rows[0]).toMatchObject({ factor: "Runway impact", now: "Shorter" });
    expect(parsed.modelResult).toMatch(/comparison_table/);
  });
});

describe("show_checklist", () => {
  it("echoes model-authored title and items as props (no data access)", async () => {
    const out = await genuiDisplayHandlers.show_checklist!(
      {
        title: "Fundraising prep",
        items: [
          { text: "Update the pitch deck", checked: true },
          { text: "Build the data room" },
          { text: "Line up reference customers", checked: false },
        ],
      },
      { companyId: "c1", userId: "u1" }
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("checklist");
    expect(parsed.render.props.title).toBe("Fundraising prep");
    expect(parsed.render.props.items).toHaveLength(3);
    expect(parsed.render.props.items[0]).toMatchObject({
      text: "Update the pitch deck",
      checked: true,
    });
    expect(parsed.render.props.items[1]).toMatchObject({
      text: "Build the data room",
      checked: false,
    });
    expect(parsed.modelResult).toMatch(/checklist/);
  });
});

describe("show_suggested_actions", () => {
  it("echoes model-authored actions as props (no data access)", async () => {
    const out = await genuiDisplayHandlers.show_suggested_actions!(
      {
        actions: [
          { label: "Show my runway", prompt: "What is my runway?" },
          { label: "Break down burn", prompt: "Break down my burn by category" },
        ],
      },
      { companyId: "c1", userId: "u1" }
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("suggested_actions");
    expect(parsed.render.props.actions).toHaveLength(2);
    expect(parsed.render.props.actions[0]).toMatchObject({
      label: "Show my runway",
      prompt: "What is my runway?",
    });
    expect(parsed.modelResult).toMatch(/suggested_actions/);
  });
});

describe("show_progress_steps", () => {
  it("echoes model-authored steps as props (no data access)", async () => {
    const out = await genuiDisplayHandlers.show_progress_steps!(
      {
        steps: [
          { label: "Prep the data room", status: "done" },
          { label: "Run partner meetings", status: "active" },
          { label: "Sign the term sheet", status: "pending" },
        ],
      },
      { companyId: "c1", userId: "u1" }
    );
    const parsed = JSON.parse(out);
    expect(parsed.render.component).toBe("progress_steps");
    expect(parsed.render.props.steps).toHaveLength(3);
    expect(parsed.render.props.steps[0]).toMatchObject({
      label: "Prep the data room",
      status: "done",
    });
    expect(parsed.render.props.steps[1]).toMatchObject({
      label: "Run partner meetings",
      status: "active",
    });
    expect(parsed.modelResult).toMatch(/progress_steps/);
  });
});
