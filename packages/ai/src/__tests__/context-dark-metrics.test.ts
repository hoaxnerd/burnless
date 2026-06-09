import { describe, it, expect } from "vitest";
import { buildFinancialSnapshot, formatContextForPrompt } from "../context";

/**
 * Phase 5 Task 5.6 — stop the AI snapshot surfacing non-finite (NaN) dark
 * metrics. After Phase 5.2/5.4 the engine emits `NaN` for production-dark
 * metrics (cac with no acquisitionSpend, ltvCacRatio inheriting it, ltv with
 * non-positive revenue churn). `metricValueAtMonth` must coerce non-finite
 * values to `null` so the existing prompt N/A guards drop the line — the AI
 * must never assert a wrong "0.0x LTV:CAC" or "$NaN CAC".
 *
 * Canonical: NaN at the current month → keyMetrics.* === null (not NaN, not 0),
 * and the formatted prompt shows "N/A", never "NaN"/"0".
 */
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
      mrr: [{ month: "2026-03", value: 12000 }],
      arr: [{ month: "2026-03", value: 144000 }],
      burnRate: [{ month: "2026-03", value: 50000 }],
      netBurnRate: [{ month: "2026-03", value: 38000 }],
      cashRunwayMonths: [{ month: "2026-03", value: 18.5 }],
      cashPosition: [{ month: "2026-03", value: 700000 }],
      revenueGrowthRate: [{ month: "2026-03", value: 20 }],
      grossMarginPercent: [{ month: "2026-03", value: 75 }],
      revenuePerEmployee: [{ month: "2026-03", value: 2000 }],
      // Dark metrics: engine emits NaN for the current month.
      ltv: [{ month: "2026-03", value: Number.NaN }],
      cac: [{ month: "2026-03", value: Number.NaN }],
      ltvCacRatio: [{ month: "2026-03", value: Number.NaN }],
      customerChurnRate: [{ month: "2026-03", value: 3 }],
    },
    totalRevenue: new Map([["2026-03", 12000]]),
    totalExpenses: new Map([["2026-03", 50000]]),
    cashPosition: new Map([["2026-03", 700000]]),
    headcountSeries: new Map([["2026-03", 6]]),
    profitAndLoss: {
      revenue: { name: "Revenue", values: [{ month: "2026-03", value: 12000 }] },
      cogs: { name: "COGS", values: [{ month: "2026-03", value: 3000 }] },
      grossProfit: { name: "Gross Profit", values: [{ month: "2026-03", value: 9000 }] },
      operatingExpenses: { name: "OpEx", values: [{ month: "2026-03", value: 50000 }] },
      netIncome: { name: "Net Income", values: [{ month: "2026-03", value: -41000 }] },
    },
    fundingRounds: [],
    headcountDetails: [],
    ...overrides,
  };
}

describe("AI snapshot — non-finite dark metrics ghost to null", () => {
  it("coerces NaN cac / ltvCacRatio / ltv to null (not NaN, not 0)", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    expect(snapshot.keyMetrics.cac).toBeNull();
    expect(snapshot.keyMetrics.ltvCacRatio).toBeNull();
    expect(snapshot.keyMetrics.ltv).toBeNull();
    // sanity: finite metrics still pass through
    expect(snapshot.keyMetrics.mrr).toBe(12000);
    expect(snapshot.keyMetrics.cashPosition).toBe(700000);
  });

  it("prompt drops dark-metric lines to N/A — never NaN / 0.0x LTV:CAC", () => {
    const snapshot = buildFinancialSnapshot(makeInput() as never);
    const text = formatContextForPrompt(snapshot);
    // No raw NaN anywhere in the rendered prompt.
    expect(text).not.toContain("NaN");
    // The LTV:CAC line must read N/A, never a wrong "0.0x".
    expect(text).toContain("- LTV:CAC Ratio: N/A");
    expect(text).not.toContain("LTV:CAC Ratio: 0.0x");
    // CAC + LTV render N/A.
    expect(text).toContain("- CAC: N/A");
    expect(text).toContain("- LTV: N/A");
  });

  it("also coerces a non-finite trailing value (no currentMonth match)", () => {
    // When the current month is absent, metricValueAtMonth falls back to the
    // last element — which can itself be NaN. That must also ghost to null.
    const snapshot = buildFinancialSnapshot(
      makeInput({
        period: { start: "2026-01", end: "2026-12", currentMonth: "2026-09" },
        metrics: {
          mrr: [{ month: "2026-03", value: 12000 }],
          arr: [{ month: "2026-03", value: 144000 }],
          burnRate: [{ month: "2026-03", value: 50000 }],
          netBurnRate: [{ month: "2026-03", value: 38000 }],
          cashRunwayMonths: [{ month: "2026-03", value: 18.5 }],
          cashPosition: [{ month: "2026-03", value: 700000 }],
          revenueGrowthRate: [{ month: "2026-03", value: 20 }],
          grossMarginPercent: [{ month: "2026-03", value: 75 }],
          revenuePerEmployee: [{ month: "2026-03", value: 2000 }],
          ltv: [{ month: "2026-03", value: Number.NaN }],
          cac: [{ month: "2026-03", value: Number.NaN }],
          ltvCacRatio: [{ month: "2026-03", value: Number.NaN }],
          customerChurnRate: [{ month: "2026-03", value: 3 }],
        },
      }) as never,
    );
    expect(snapshot.keyMetrics.cac).toBeNull();
    expect(snapshot.keyMetrics.ltvCacRatio).toBeNull();
    expect(snapshot.keyMetrics.ltv).toBeNull();
  });
});
