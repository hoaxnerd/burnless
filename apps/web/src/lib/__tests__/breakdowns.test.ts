import { describe, it, expect } from "vitest";
import { buildExpenseBreakdown, buildExpenseMonthlyBySubcategory, buildRevenueBreakdown } from "../breakdowns";
import type { BlendedExpenseLine, BlendedRevenueLine } from "../compute-financials";
import type { MonthlySeries } from "@burnless/engine";

const m = (month: string, v: number): MonthlySeries => new Map([[month, v]]);

describe("buildExpenseBreakdown", () => {
  it("groups by derived subcategory, reconciles to total, sorts desc", () => {
    const lines: BlendedExpenseLine[] = [
      { accountId: "1", accountName: "Hosting", category: "cogs", values: m("2026-06", 500) },
      { accountId: "headcount-cost", accountName: "Personnel Costs", category: "operating_expense", values: m("2026-06", 9000) },
      { accountId: "2", accountName: "Software Subscriptions", category: "operating_expense", values: m("2026-06", 1000) },
    ];
    const rows = buildExpenseBreakdown(lines, "2026-06", 10500);
    expect(rows[0]?.subcategory).toBe("People");
    expect(rows[0]?.amount).toBe(9000);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(10500, 2);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100, 1);
  });

  it("omits zero-amount lines for the month", () => {
    const lines: BlendedExpenseLine[] = [
      { accountId: "1", accountName: "Hosting", category: "cogs", values: m("2026-06", 0) },
      { accountId: "2", accountName: "Ads", category: "operating_expense", values: m("2026-06", 200) },
    ];
    const rows = buildExpenseBreakdown(lines, "2026-06", 200);
    expect(rows.length).toBe(1);
    expect(rows[0]?.amount).toBe(200);
  });

  it("keeps a negative expense line so the breakdown still reconciles", () => {
    const lines: BlendedExpenseLine[] = [
      { accountId: "1", accountName: "Ads", category: "operating_expense", values: m("2026-06", 1000) },
      // category "cogs" so this reversal maps to its own "Cost of Goods Sold" row
      // (instead of netting into "Uncategorized" with Ads) — keeps a negative row.
      { accountId: "2", accountName: "Refunds", category: "cogs", values: m("2026-06", -200) },
    ];
    const rows = buildExpenseBreakdown(lines, "2026-06", 800);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(800, 2); // reconciles incl. the -200
    expect(rows.some((r) => r.amount < 0)).toBe(true);
  });

  it("merges two accounts that share a subcategory", () => {
    const lines: BlendedExpenseLine[] = [
      { accountId: "1", accountName: "AWS Hosting", category: "cogs", values: m("2026-06", 300) },
      { accountId: "2", accountName: "GCP Hosting", category: "cogs", values: m("2026-06", 200) },
    ];
    const rows = buildExpenseBreakdown(lines, "2026-06", 500);
    // both COGS accounts collapse into one subcategory row, summed
    const total = rows.reduce((s, r) => s + r.amount, 0);
    expect(total).toBeCloseTo(500, 2);
    const cogsRow = rows.find((r) => r.amount === 500);
    expect(cogsRow).toBeTruthy();
  });
});

describe("buildExpenseMonthlyBySubcategory", () => {
  it("buildExpenseMonthlyBySubcategory produces per-month rows keyed by subcategory", () => {
    const lines: BlendedExpenseLine[] = [
      { accountId: "headcount-cost", accountName: "Personnel Costs", category: "operating_expense",
        values: new Map([["2026-05", 8000], ["2026-06", 9000]]) },
      { accountId: "1", accountName: "AWS Hosting", category: "cogs",
        values: new Map([["2026-05", 400], ["2026-06", 500]]) },
    ];
    const rows = buildExpenseMonthlyBySubcategory(lines);
    expect(Object.keys(rows[0]!)).toContain("People");
    expect(rows.find((r) => r.month === "2026-06")?.["People"]).toBe(9000);
    expect(rows.length).toBe(2); // two months
  });
});

describe("buildRevenueBreakdown", () => {
  it("lists streams plus an Imported / Other revenue residual that reconciles", () => {
    const lines: BlendedRevenueLine[] = [
      { streamId: "rs-sub", name: "Pro Plan", type: "subscription", values: m("2026-06", 1000) },
    ];
    const rows = buildRevenueBreakdown(lines, m("2026-06", 700), "2026-06", 1700);
    expect(rows.find((r) => r.name === "Pro Plan")?.amount).toBe(1000);
    expect(rows.find((r) => r.name === "Imported / Other revenue")?.amount).toBe(700);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1700, 2);
  });

  it("omits the residual row when it is zero", () => {
    const lines: BlendedRevenueLine[] = [
      { streamId: "rs", name: "Pro", type: "subscription", values: m("2026-06", 1000) },
    ];
    const rows = buildRevenueBreakdown(lines, m("2026-06", 0), "2026-06", 1000);
    expect(rows.some((r) => r.name === "Imported / Other revenue")).toBe(false);
  });

  it("keeps a negative revenue residual so revenue still reconciles", () => {
    const lines: BlendedRevenueLine[] = [
      { streamId: "rs", name: "Pro", type: "subscription", values: m("2026-06", 1000) },
    ];
    const rows = buildRevenueBreakdown(lines, m("2026-06", -50), "2026-06", 950);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(950, 2);
    expect(rows.find((r) => r.name === "Imported / Other revenue")?.amount).toBe(-50);
  });
});
