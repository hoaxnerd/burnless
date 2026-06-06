import { describe, it, expect, vi } from "vitest";
const computeDashboardData = vi.fn(async () => ({
  currentMonth: "2026-06", prevMonth: "2026-05",
  totalRevenue: new Map([["2026-06", 1700], ["2026-05", 1500]]),
  revenueLines: [{ streamId: "rs", name: "Pro Plan", type: "subscription", values: new Map([["2026-06", 1000], ["2026-05", 900]]) }],
  revenueResidual: new Map([["2026-06", 700], ["2026-05", 600]]),
  metrics: { newMrr: [], expansionMrr: [], churnedMrr: [], netNewMrr: [], mrr: [], saasQuickRatio: [], totalCustomers: [], customerChurnRate: [], arpa: [], ltv: [] },
}));
vi.mock("../compute-dashboard", () => ({ computeDashboardData: (...args: unknown[]) => computeDashboardData(...(args as [])) }));
vi.mock("../data", () => ({ getRevenueStreams: vi.fn(async () => [{ id: "rs", name: "Pro Plan", type: "subscription", parameters: {}, startDate: new Date(2026,0,1), endDate: null }]) }));
import { computeRevenueDetails } from "../compute-revenue";

describe("computeRevenueDetails — reconciled breakdown", () => {
  it("streamBreakdown (incl. residual) reconciles to totalRevenue", async () => {
    const d = await computeRevenueDetails("co", "sc");
    const sum = d.streamBreakdown.reduce((s, b) => s + b.currentRevenue, 0);
    expect(sum).toBeCloseTo(1700, 2);
    const imported = d.streamBreakdown.find((b) => b.name === "Imported / Other revenue");
    expect(imported?.currentRevenue).toBe(700);
    expect(d.streamBreakdown.find((b) => b.name === "Pro Plan")?.currentRevenue).toBe(1000);
  });

  it("maps the Pro Plan row by streamId (id-based) with a non-empty series", async () => {
    const d = await computeRevenueDetails("co2", "sc");
    const pro = d.streamBreakdown.find((b) => b.name === "Pro Plan");
    expect(pro?.id).toBe("rs");
    expect(pro?.monthlySeries.length ?? 0).toBeGreaterThan(0);
  });

  it("omits the Imported / Other revenue row when the residual is zero, still reconciling", async () => {
    computeDashboardData.mockResolvedValueOnce({
      currentMonth: "2026-06", prevMonth: "2026-05",
      totalRevenue: new Map([["2026-06", 1000], ["2026-05", 900]]),
      revenueLines: [{ streamId: "rs", name: "Pro Plan", type: "subscription", values: new Map([["2026-06", 1000], ["2026-05", 900]]) }],
      revenueResidual: new Map([["2026-06", 0]]),
      metrics: { newMrr: [], expansionMrr: [], churnedMrr: [], netNewMrr: [], mrr: [], saasQuickRatio: [], totalCustomers: [], customerChurnRate: [], arpa: [], ltv: [] },
    });
    const d = await computeRevenueDetails("co3", "sc");
    expect(d.streamBreakdown.some((b) => b.name === "Imported / Other revenue")).toBe(false);
    const sum = d.streamBreakdown.reduce((s, b) => s + b.currentRevenue, 0);
    expect(sum).toBeCloseTo(1000, 2);
  });
});
