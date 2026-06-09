import { describe, it, expect } from "vitest";
import { computeFinancials } from "../compute-financials";

// Phase 4 §4.7: forecastLines.name must thread through computeFinancials so a
// custom_formula line that references another line BY NAME resolves. Without the
// name on ForecastLineInput, the reference is unknown → the dependent line reads
// 0 and never reaches totalOpex / netIncome.
function inputWithNamedRef() {
  const periodStart = new Date(2026, 0, 1);
  const periodEnd = new Date(2026, 11, 1);
  return {
    accounts: [
      { id: "a-rev-line", name: "Rev Driver Account", category: "operating_expense" },
      { id: "a-dependent", name: "Ten Percent Of Rev", category: "operating_expense" },
    ],
    forecastLines: [
      // A line NAMED "Rev" (a valid identifier) producing a fixed 1000/month.
      { id: "fl-rev", accountId: "a-rev-line", name: "Rev", method: "fixed",
        parameters: { amount: 1000 }, startDate: new Date(2026, 0, 1), endDate: null },
      // A dependent line whose custom_formula references "Rev" by name → 100/month.
      { id: "fl-dep", accountId: "a-dependent", name: "DepLine", method: "custom_formula",
        parameters: { expression: "Rev * 0.1" }, startDate: new Date(2026, 0, 1), endDate: null },
    ],
    forecastValues: [],
    revenueStreams: [],
    headcountPlans: [],
    fundingRounds: [],
    transactions: [],
    periodStart,
    periodEnd,
  } as Parameters<typeof computeFinancials>[0];
}

describe("computeFinancials — custom_formula name resolution (Phase 4 §4.7)", () => {
  it("a custom_formula line referencing another line by NAME flows into totalOpex/netIncome", () => {
    const r = computeFinancials(inputWithNamedRef());
    const month = "2026-06";
    // Rev = 1000, dependent = Rev * 0.1 = 100 → totalOpex for the month = 1100.
    expect(r.totalOpex.get(month) ?? 0).toBeCloseTo(1100, 2);
    // No revenue → netIncome is the negative of total expenses for the month.
    expect(r.netIncome.get(month) ?? 0).toBeCloseTo(-1100, 2);
  });
});
