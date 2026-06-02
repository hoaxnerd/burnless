import { describe, it, expect, vi } from "vitest";

vi.mock("../../compute-dashboard", () => ({
  computeDashboardData: vi.fn(async () => ({
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
    cashPosition: new Map([
      ["2026-05", 900000],
      ["2026-06", 818000],
    ]),
    headcountCostSeries: new Map([
      ["2026-05", 120000],
      ["2026-06", 130000],
    ]),
  })),
}));
vi.mock("../../data", () => ({
  getDefaultScenario: vi.fn(async () => ({ id: "s1" })),
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
