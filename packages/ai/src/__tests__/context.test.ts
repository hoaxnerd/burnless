import { describe, it, expect } from "vitest";
import { buildFinancialSnapshot, formatContextForPrompt } from "../context";

/** Helper to create a MonthlySeries (Map<string, number>) */
function series(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

// Minimal valid input for buildFinancialSnapshot
function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    company: {
      name: "Acme Inc",
      stage: "seed",
      businessModel: "saas",
      industry: "fintech",
      currency: "USD",
      locale: "en-US",
    },
    scenario: { id: "s1", name: "Base Case", source: "blank" },
    scenarios: [{ id: "s1", name: "Base Case", source: "blank", status: "active" }],
    accounts: [{ id: "a1", name: "Engineering", type: "expense", category: "opex" }],
    departments: [{ id: "d1", name: "Engineering" }],
    period: { start: "2026-01", end: "2026-12", currentMonth: "2026-03" },
    metrics: {
      mrr: [{ month: "2026-02", value: 10000 }, { month: "2026-03", value: 12000 }],
      arr: [{ month: "2026-03", value: 144000 }],
      burnRate: [{ month: "2026-03", value: 50000 }],
      netBurnRate: [{ month: "2026-03", value: 38000 }],
      cashRunwayMonths: [{ month: "2026-03", value: 18.5 }],
      cashPosition: [{ month: "2026-03", value: 700000 }],
      revenueGrowthRate: [{ month: "2026-03", value: 20 }],
      grossMarginPercent: [{ month: "2026-03", value: 75 }],
      revenuePerEmployee: [{ month: "2026-03", value: 2000 }],
      ltv: [{ month: "2026-03", value: 5000 }],
      cac: [{ month: "2026-03", value: 1200 }],
      ltvCacRatio: [{ month: "2026-03", value: 4.2 }],
      customerChurnRate: [{ month: "2026-03", value: 3 }],
    },
    totalRevenue: series({ "2026-01": 8000, "2026-02": 10000, "2026-03": 12000 }),
    totalExpenses: series({ "2026-01": 45000, "2026-02": 48000, "2026-03": 50000 }),
    cashPosition: series({ "2026-01": 780000, "2026-02": 740000, "2026-03": 700000 }),
    headcountSeries: series({ "2026-01": 5, "2026-02": 6, "2026-03": 6 }),
    profitAndLoss: {
      revenue: { name: "Revenue", values: [{ month: "2026-03", value: 12000 }] },
      cogs: { name: "COGS", values: [{ month: "2026-03", value: 3000 }] },
      grossProfit: { name: "Gross Profit", values: [{ month: "2026-03", value: 9000 }] },
      operatingExpenses: { name: "OpEx", values: [{ month: "2026-03", value: 50000 }] },
      netIncome: { name: "Net Income", values: [{ month: "2026-03", value: -41000 }] },
    },
    fundingRounds: [
      { name: "Seed", type: "equity", amount: 1000000, date: "2025-06-01", isProjected: false },
    ],
    ...overrides,
  };
}

describe("buildFinancialSnapshot", () => {
  it("extracts latest metric values", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    expect(snapshot.keyMetrics.mrr).toBe(12000);
    expect(snapshot.keyMetrics.arr).toBe(144000);
    expect(snapshot.keyMetrics.burnRate).toBe(50000);
    expect(snapshot.keyMetrics.runway).toBe(18.5);
    expect(snapshot.keyMetrics.cashPosition).toBe(700000);
  });

  it("handles empty metric arrays", () => {
    const input = makeInput({
      metrics: {
        mrr: [],
        arr: [],
        burnRate: [],
        netBurnRate: [],
        cashRunwayMonths: [],
        cashPosition: [],
        revenueGrowthRate: [],
        grossMarginPercent: [],
        revenuePerEmployee: [],
        ltv: [],
        cac: [],
        ltvCacRatio: [],
        customerChurnRate: [],
      },
    });
    const snapshot = buildFinancialSnapshot(input as never);
    expect(snapshot.keyMetrics.mrr).toBeNull();
    expect(snapshot.keyMetrics.runway).toBeNull();
    expect(snapshot.keyMetrics.cashPosition).toBeNull();
  });

  it("maps monthly series correctly", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    expect(snapshot.revenueByMonth).toHaveLength(3);
    expect(snapshot.revenueByMonth[2]).toEqual({ month: "2026-03", amount: 12000 });
    expect(snapshot.cashByMonth).toHaveLength(3);
    expect(snapshot.headcountByMonth).toHaveLength(3);
  });

  it("sums P&L line items", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    expect(snapshot.profitAndLoss.totalRevenue).toBe(12000);
    expect(snapshot.profitAndLoss.totalCogs).toBe(3000);
    expect(snapshot.profitAndLoss.grossProfit).toBe(9000);
    expect(snapshot.profitAndLoss.netIncome).toBe(-41000);
  });

  it("passes through funding rounds", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    expect(snapshot.fundingRounds).toHaveLength(1);
    expect(snapshot.fundingRounds[0]!.name).toBe("Seed");
    expect(snapshot.fundingRounds[0]!.amount).toBe(1000000);
  });

  it("passes through company metadata", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    expect(snapshot.company.name).toBe("Acme Inc");
    expect(snapshot.company.stage).toBe("seed");
    expect(snapshot.scenario.name).toBe("Base Case");
  });

  it("handles empty series maps", () => {
    const input = makeInput({
      totalRevenue: series({}),
      totalExpenses: series({}),
      cashPosition: series({}),
      headcountSeries: series({}),
    });
    const snapshot = buildFinancialSnapshot(input as never);
    expect(snapshot.revenueByMonth).toEqual([]);
    expect(snapshot.expensesByMonth).toEqual([]);
    expect(snapshot.cashByMonth).toEqual([]);
    expect(snapshot.headcountByMonth).toEqual([]);
  });
});

describe("formatContextForPrompt", () => {
  it("includes company name in header", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Financial Context for Acme Inc");
  });

  it("includes key metrics section", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Key Metrics (Latest Month)");
    expect(text).toContain("MRR:");
    expect(text).toContain("Runway:");
    expect(text).toContain("Burn Rate:");
  });

  it("includes P&L summary", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("P&L Summary");
    expect(text).toContain("Total Revenue:");
    expect(text).toContain("Net Income:");
  });

  it("includes funding rounds", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Funding Rounds");
    expect(text).toContain("Seed");
  });

  it("marks projected funding rounds", () => {
    const input = makeInput({
      fundingRounds: [
        { name: "Series A", type: "equity", amount: 5000000, date: "2027-01-01", isProjected: true },
      ],
    });
    const snapshot = buildFinancialSnapshot(input as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("[projected]");
  });

  it("shows N/A for null metrics", () => {
    const input = makeInput({
      metrics: {
        mrr: [], arr: [], burnRate: [], netBurnRate: [],
        cashRunwayMonths: [], cashPosition: [], revenueGrowthRate: [],
        grossMarginPercent: [], revenuePerEmployee: [], ltv: [],
        cac: [], ltvCacRatio: [], customerChurnRate: [],
      },
    });
    const snapshot = buildFinancialSnapshot(input as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("N/A");
  });

  it("includes scenario name", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Base Case");
  });

  it("includes departments", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Departments");
    expect(text).toContain("Engineering");
  });

  it("includes chart of accounts", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Chart of Accounts");
  });

  it("skips sections when data is empty", () => {
    const input = makeInput({
      fundingRounds: [],
      scenarios: [{ id: "s1", name: "Base", source: "blank", status: "active" }],
      accounts: [],
      departments: [],
    });
    const snapshot = buildFinancialSnapshot(input as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).not.toContain("Funding Rounds");
    expect(text).not.toContain("Available Scenarios"); // Only shown when >1
    expect(text).not.toContain("Chart of Accounts");
    expect(text).not.toContain("Departments");
  });

  it("shows revenue trend for last 6 months", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Monthly Revenue Trend");
  });

  it("shows cash position trend", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Monthly Cash Position");
  });

  it("formats percentage-point metrics without double-multiplication", () => {
    // Engine returns percentage points: 20 means 20%, 75 means 75%, 3 means 3%
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    expect(text).toContain("Revenue Growth: 20.0%");
    expect(text).toContain("Gross Margin: 75.0%");
    expect(text).toContain("Churn Rate: 3.0%");
    // Must NOT contain double-multiplied values
    expect(text).not.toContain("2000.0%");
    expect(text).not.toContain("7500.0%");
    expect(text).not.toContain("300.0%");
  });
});
