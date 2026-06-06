import { describe, it, expect, vi } from "vitest";

// The weekly digest surfaces "top expense categories" from
// computeExpenseDetails().subcategoryBreakdown.slice(0, 5). Tasks 3 & 4 made
// that breakdown reconcile to the actuals-blended dashboard totals, so the
// emailed digest now shows blended numbers automatically. This regression
// guards that the digest keeps sourcing topExpenseCategories from the blended
// breakdown — ordered, capped at 5, with amounts flowing through.

const SUBCATEGORY_BREAKDOWN = [
  { subcategory: "People", amount: 9000, prevAmount: 8000, changePercent: 0.125 },
  { subcategory: "Marketing", amount: 6000, prevAmount: 5000, changePercent: 0.2 },
  { subcategory: "Hosting", amount: 500, prevAmount: 400, changePercent: 0.25 },
  { subcategory: "Software", amount: 300, prevAmount: 300, changePercent: 0 },
  { subcategory: "Travel", amount: 200, prevAmount: 100, changePercent: 1 },
  { subcategory: "Office", amount: 100, prevAmount: 50, changePercent: 1 },
];

vi.mock("../compute-dashboard", () => ({
  computeDashboardData: vi.fn(async () => ({
    metrics: {
      cashPosition: [{ month: "2099-01", value: 500000 }],
      netBurnRate: [{ month: "2099-01", value: 12000 }],
      cashRunwayMonths: [{ month: "2099-01", value: 41 }],
      mrr: [{ month: "2099-01", value: 20000 }],
    },
    startingCash: 500000,
    totalRevenue: new Map([["2099-01", 20000]]),
    totalExpenses: new Map([["2099-01", 16100]]),
    headcountSeries: new Map([["2099-01", 9]]),
  })),
}));

vi.mock("../compute-expenses", () => ({
  computeExpenseDetails: vi.fn(async () => ({
    subcategoryBreakdown: SUBCATEGORY_BREAKDOWN,
    lineItems: [],
  })),
}));

vi.mock("../compute-revenue", () => ({
  computeRevenueDetails: vi.fn(async () => ({})),
}));

vi.mock("../data", () => ({
  getDefaultScenario: vi.fn(async () => ({ id: "sc-1", name: "Base" })),
}));

import { computeWeeklyDigest, buildDeterministicSummary } from "../compute-digest";

describe("computeWeeklyDigest — top expense categories (blended)", () => {
  it("sources topExpenseCategories from the blended subcategoryBreakdown, capped at 5", async () => {
    const m = await computeWeeklyDigest("co-cap");
    expect(m).not.toBeNull();

    // 6 categories in the breakdown → top 5 only.
    expect(m!.topExpenseCategories).toHaveLength(5);

    // Preserves the breakdown's own order; the 6th (Office) is dropped.
    expect(m!.topExpenseCategories.map((c) => c.name)).toEqual([
      "People",
      "Marketing",
      "Hosting",
      "Software",
      "Travel",
    ]);
    expect(m!.topExpenseCategories.map((c) => c.name)).not.toContain("Office");
  });

  it("flows the People (blended) amount through unchanged and scales changePercent to whole percent", async () => {
    const m = await computeWeeklyDigest("co-people");
    const people = m!.topExpenseCategories.find((c) => c.name === "People")!;

    // amount is passed straight from the blended breakdown.
    expect(people.amount).toBe(9000);
    // changePercent (0.125 ratio) is surfaced as 12.5 (percent points).
    expect(people.change).toBeCloseTo(12.5, 5);
  });

  it("renders the blended top-spend lines in the deterministic email summary", async () => {
    const m = await computeWeeklyDigest("co-summary");
    const summary = buildDeterministicSummary(m!);

    expect(summary).toContain("Top Spend:");
    // People row reflects the blended amount, compact-formatted.
    expect(summary).toMatch(/People:.*9/);
    // Capped category is absent from the rendered email.
    expect(summary).not.toContain("Office");
  });
});
