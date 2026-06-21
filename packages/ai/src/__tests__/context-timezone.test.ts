import { describe, it, expect } from "vitest";
import { buildFinancialSnapshot, formatContextForPrompt } from "../context";

function series(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

const base = {
  company: { name: "Acme", stage: "seed", businessModel: "saas", industry: null, currency: "USD", timezone: "Asia/Kolkata" },
  scenario: { id: "base", name: "Base", source: "base" },
  scenarios: [], accounts: [], departments: [],
  period: { start: "2026-01", end: "2026-12", currentMonth: "2026-06" },
  metrics: {
    mrr: [], arr: [], burnRate: [], netBurnRate: [],
    cashRunwayMonths: [], cashPosition: [], revenueGrowthRate: [],
    grossMarginPercent: [], revenuePerEmployee: [], ltv: [], cac: [],
    ltvCacRatio: [], customerChurnRate: [],
  },
  totalRevenue: series({}),
  totalExpenses: series({}),
  cashPosition: series({}),
  headcountSeries: series({}),
  profitAndLoss: {
    revenue: { name: "Revenue", values: [] },
    cogs: { name: "COGS", values: [] },
    grossProfit: { name: "Gross Profit", values: [] },
    operatingExpenses: { name: "OpEx", values: [] },
    netIncome: { name: "Net Income", values: [] },
  },
  fundingRounds: [],
  headcountDetails: [],
};

describe("context timezone", () => {
  it("surfaces the company timezone in the formatted context", () => {
    const snap = buildFinancialSnapshot(base as never);
    expect(formatContextForPrompt(snap)).toContain("Asia/Kolkata");
  });
});
