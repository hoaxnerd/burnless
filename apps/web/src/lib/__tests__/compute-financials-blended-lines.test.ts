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

describe("computeFinancials — balance sheet balances (RPT-01 web)", () => {
  // RPT-01: compute-financials injects A/P (≈ 1 month of expenses) and routes it
  // through generateBalanceSheet's workingCapitalAdjustments so the engine adds
  // the offsetting cash asset. Assets === Liabilities + Equity must hold for
  // EVERY month on the real web render (previously the A/P-only liability row
  // dangled the sheet).
  it("Assets === Liabilities + Equity for every month", () => {
    const r = computeFinancials(baseInput());

    const byMonth = (li: { month: string; value: number }[]) =>
      new Map(li.map((v) => [v.month, v.value]));
    const assets = byMonth(r.balanceSheet.assets.values);
    const liabilities = byMonth(r.balanceSheet.liabilities.values);
    const equity = byMonth(r.balanceSheet.equity.values);

    const offenders: string[] = [];
    for (const m of assets.keys()) {
      const a = assets.get(m) ?? 0;
      const l = liabilities.get(m) ?? 0;
      const e = equity.get(m) ?? 0;
      if (Math.abs(a - (l + e)) >= 0.01) {
        offenders.push(`${m}: A=${a} L=${l} E=${e} diff=${(a - (l + e)).toFixed(2)}`);
      }
    }

    expect(offenders, `Balance sheet dangles:\n${offenders.join("\n")}`).toEqual([]);
    // A/P should be non-zero (expenses exist), so this is a real balancing test.
    expect((liabilities.get("2026-06") ?? 0)).toBeGreaterThan(0);
  });
});
