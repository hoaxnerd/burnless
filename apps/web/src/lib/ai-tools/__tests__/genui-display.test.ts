import { describe, it, expect, vi } from "vitest";

vi.mock("../../compute-dashboard", () => ({
  computeDashboardData: vi.fn(async () => ({
    metrics: {
      cashRunwayMonths: [{ month: "2026-06", value: 14.2 }],
      netBurnRate: [{ month: "2026-06", value: 82000 }],
      mrr: [{ month: "2026-06", value: 50000 }],
    },
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
