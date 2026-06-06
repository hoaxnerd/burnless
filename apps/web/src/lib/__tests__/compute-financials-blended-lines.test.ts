import { describe, it, expect } from "vitest";
import { computeFinancials } from "../compute-financials";

function baseInput() {
  const periodStart = new Date(2026, 0, 1);
  const periodEnd = new Date(2026, 11, 1);
  return {
    accounts: [
      { id: "a-opex", name: "Software Subscriptions", category: "operating_expense" },
      { id: "a-cogs", name: "Hosting", category: "cogs" },
      { id: "a-rev", name: "Revenue", category: "revenue", isSystem: true },
    ],
    forecastLines: [
      { id: "fl-opex", accountId: "a-opex", method: "fixed", parameters: { amount: 1000 },
        startDate: new Date(2026, 0, 1), endDate: null },
    ],
    forecastValues: [],
    revenueStreams: [
      { id: "rs-sub", name: "Pro Plan", type: "subscription",
        parameters: { startingCustomers: 10, monthlyPrice: 100, newCustomersPerMonth: 0, monthlyChurnRate: 0 },
        startDate: new Date(2026, 0, 1), endDate: null },
    ],
    headcountPlans: [],
    fundingRounds: [],
    transactions: [
      { accountId: "a-cogs", date: new Date(2026, 5, 15), amount: 500 },
      { accountId: "a-rev", date: new Date(2026, 5, 15), amount: 700 },
    ],
    periodStart,
    periodEnd,
  } as Parameters<typeof computeFinancials>[0];
}

describe("computeFinancials — blended lines", () => {
  it("returns blended expense lines that sum to totalExpenses for a month", () => {
    const r = computeFinancials(baseInput());
    const month = "2026-06";
    const expSum = r.expenseLines.reduce((s, l) => s + (l.values.get(month) ?? 0), 0);
    expect(expSum).toBeCloseTo(r.totalExpenses.get(month) ?? 0, 2);
    expect(r.expenseLines.some((l) => l.accountId === "a-opex")).toBe(true);
    expect(r.expenseLines.some((l) => l.accountId === "a-cogs")).toBe(true);
  });

  it("returns revenue stream lines plus a residual that reconciles to totalRevenue", () => {
    const r = computeFinancials(baseInput());
    const month = "2026-06";
    const streamSum = r.revenueLines.reduce((s, l) => s + (l.values.get(month) ?? 0), 0);
    const residual = r.revenueResidual.get(month) ?? 0;
    expect(streamSum + residual).toBeCloseTo(r.totalRevenue.get(month) ?? 0, 2);
    expect(residual).toBeCloseTo(700, 2);
  });

  it("expense lines reconcile to totalExpenses in a projection month (carry-forward applied)", () => {
    const r = computeFinancials(baseInput());
    const projMonth = "2026-11"; // after the last (June) COGS actual
    const expSum = r.expenseLines.reduce((s, l) => s + (l.values.get(projMonth) ?? 0), 0);
    expect(expSum).toBeCloseTo(r.totalExpenses.get(projMonth) ?? 0, 2);
    // the COGS actual-only account must carry forward (non-zero), not read 0
    const cogsLine = r.expenseLines.find((l) => l.accountId === "a-cogs");
    expect(cogsLine?.values.get(projMonth) ?? 0).toBeGreaterThan(0);
  });

  it("with no streams, all revenue is residual", () => {
    const input = baseInput();
    input.revenueStreams = [];
    const r = computeFinancials(input);
    expect(r.revenueLines.length).toBe(0);
    const resSum = [...r.revenueResidual.values()].reduce((s, v) => s + v, 0);
    const totSum = [...r.totalRevenue.values()].reduce((s, v) => s + v, 0);
    expect(resSum).toBeCloseTo(totSum, 2);
  });
});
