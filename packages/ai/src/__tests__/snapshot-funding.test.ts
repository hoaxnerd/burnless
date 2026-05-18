import { describe, it, expect } from "vitest";
import { buildFinancialSnapshot } from "../context";

/** Minimal series helper */
function series(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

/** Minimal valid ContextInput (with widened fundingRounds) */
function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    company: { name: "Acme Inc", stage: "seed", businessModel: "saas", industry: null, currency: "USD" },
    scenario: { id: "s1", name: "Base Case", source: "blank" },
    scenarios: [{ id: "s1", name: "Base Case", source: "blank", status: "active" }],
    accounts: [],
    departments: [],
    period: { start: "2026-01", end: "2026-12", currentMonth: "2026-03" },
    metrics: {
      mrr: [], arr: [], burnRate: [], netBurnRate: [], cashRunwayMonths: [],
      cashPosition: [], revenueGrowthRate: [], grossMarginPercent: [],
      revenuePerEmployee: [], ltv: [], cac: [], ltvCacRatio: [], customerChurnRate: [],
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
    fundingRounds: [
      {
        id: "fr-1",
        name: "Seed",
        type: "equity",
        amount: 1_000_000,
        date: "2025-06-01",
        closeDate: "2025-07-01",
        isProjected: false,
        parameters: { valuationCap: 5_000_000 },
        investors: [
          { name: "Angel Investor A", amountInvested: 500_000 },
          { name: "Angel Investor B", amountInvested: 500_000 },
        ],
      },
    ],
    headcountDetails: [],
    ...overrides,
  };
}

describe("FinancialSnapshot.fundingRounds shape (Phase 2 D §1.5)", () => {
  it("passes through closeDate, parameters, and investors from ContextInput", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    expect(snapshot.fundingRounds).toHaveLength(1);
    const round = snapshot.fundingRounds[0]!;
    expect(round.closeDate).toBe("2025-07-01");
    expect(round.parameters).toEqual({ valuationCap: 5_000_000 });
    expect(round.investors).toHaveLength(2);
    expect(round.investors[0]!.name).toBe("Angel Investor A");
    expect(round.investors[0]!.amountInvested).toBe(500_000);
  });

  it("defaults closeDate to null when absent", () => {
    const input = makeInput({
      fundingRounds: [
        {
          id: "fr-2",
          name: "Pre-Seed",
          type: "safe",
          amount: 250_000,
          date: "2024-01-01",
          isProjected: false,
          // no closeDate, no parameters, no investors
        },
      ],
    });
    const snapshot = buildFinancialSnapshot(input as never);
    const round = snapshot.fundingRounds[0]!;
    expect(round.closeDate).toBeNull();
    expect(round.parameters).toEqual({});
    expect(round.investors).toEqual([]);
  });

  it("defaults interestPaidYtd and principalPaidYtd to 0", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const round = snapshot.fundingRounds[0]!;
    expect(round.interestPaidYtd).toBe(0);
    expect(round.principalPaidYtd).toBe(0);
  });

  it("FinancialSnapshot type: fundingRounds element has all 10 expected fields", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const round = snapshot.fundingRounds[0]!;
    // Ensure all 10 fields are present
    expect("name" in round).toBe(true);
    expect("type" in round).toBe(true);
    expect("amount" in round).toBe(true);
    expect("date" in round).toBe(true);
    expect("closeDate" in round).toBe(true);
    expect("isProjected" in round).toBe(true);
    expect("parameters" in round).toBe(true);
    expect("investors" in round).toBe(true);
    expect("interestPaidYtd" in round).toBe(true);
    expect("principalPaidYtd" in round).toBe(true);
  });
});
