/**
 * Tests for buildTeamPrompt in page-insights.ts.
 *
 * XC-01: `buildTeamPrompt` was reading `d.name` on department rows whose
 * actual key is `d.department` (as produced by TeamView's departmentBreakdown).
 * This caused "undefined department" to appear in the AI prompt.
 */

import { describe, it, expect } from "vitest";
import { buildTeamPrompt } from "../page-insights";
import type { FinancialSnapshot } from "../types";

// ── Minimal snapshot fixture ────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<FinancialSnapshot["keyMetrics"]> = {}): FinancialSnapshot {
  return {
    company: {
      name: "Acme Inc",
      stage: "seed",
      businessModel: "SaaS",
      industry: "Software",
      currency: "USD",
      locale: "en-US",
    },
    scenario: { id: "s1", name: "Base", source: "manual" },
    period: { start: "2026-01-01", end: "2026-12-31", currentMonth: "2026-06" },
    keyMetrics: {
      mrr: 50000,
      arr: 600000,
      burnRate: 80000,
      netBurn: 30000,
      runway: 18,
      cashPosition: 1440000,
      revenueGrowth: 5.2,
      grossMargin: 72,
      headcount: 12,
      ltv: 24000,
      cac: 4000,
      ltvCacRatio: 6,
      churnRate: 2.1,
      ...overrides,
    },
    revenueByMonth: [],
    revenueStreams: [],
    expensesByMonth: [],
    expenses: [],
    cashByMonth: [],
    headcountByMonth: [],
    profitAndLoss: {
      totalRevenue: 50000,
      totalCogs: 14000,
      grossProfit: 36000,
      totalOpex: 66000,
      netIncome: -30000,
    },
    fundingRounds: [],
    scenarios: [],
    accounts: [],
    departments: [],
    headcountDetails: [],
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("buildTeamPrompt — department field key", () => {
  it("renders the department label when rows carry the `department` key", () => {
    const pageData = {
      departments: [
        { department: "Engineering", headcount: 6, monthlyCost: 60000, members: [] },
        { department: "Sales", headcount: 3, monthlyCost: 30000, members: [] },
      ],
      plannedHires: 2,
    };

    const prompt = buildTeamPrompt(makeSnapshot(), pageData);

    expect(prompt).toContain("Engineering");
    expect(prompt).toContain("Sales");
    expect(prompt).not.toContain("undefined");
  });

  it("does NOT render the literal string `undefined` for any department", () => {
    const pageData = {
      departments: [
        { department: "Product", headcount: 4, monthlyCost: 40000, members: [] },
      ],
      plannedHires: 0,
    };

    const prompt = buildTeamPrompt(makeSnapshot(), pageData);

    expect(prompt).not.toContain("undefined");
  });

  it("falls back to `name` when `department` key is absent", () => {
    const pageData = {
      departments: [
        // Legacy shape with only `name`
        { name: "Design", headcount: 2, monthlyCost: 20000 },
      ],
      plannedHires: 1,
    };

    const prompt = buildTeamPrompt(makeSnapshot(), pageData);

    expect(prompt).toContain("Design");
    expect(prompt).not.toContain("undefined");
  });

  it("falls back to `Unassigned` when both `department` and `name` are missing", () => {
    const pageData = {
      departments: [
        { headcount: 1, monthlyCost: 10000 } as Record<string, unknown>,
      ],
      plannedHires: 0,
    };

    const prompt = buildTeamPrompt(makeSnapshot(), pageData);

    expect(prompt).toContain("Unassigned");
    expect(prompt).not.toContain("undefined");
  });

  it("produces `No department data` when departments array is empty", () => {
    const prompt = buildTeamPrompt(makeSnapshot(), { departments: [], plannedHires: 0 });

    expect(prompt).toContain("No department data");
    expect(prompt).not.toContain("undefined");
  });

  it("produces `No department data` when pageData has no departments key", () => {
    const prompt = buildTeamPrompt(makeSnapshot(), { plannedHires: 0 });

    expect(prompt).toContain("No department data");
    expect(prompt).not.toContain("undefined");
  });

  it("includes headcount and cost in the rendered line", () => {
    const pageData = {
      departments: [
        { department: "Engineering", headcount: 5, monthlyCost: 50000, members: [] },
      ],
      plannedHires: 3,
    };

    const prompt = buildTeamPrompt(makeSnapshot(), pageData);

    expect(prompt).toContain("Engineering");
    expect(prompt).toContain("5 people");
  });

  it("includes Planned Hires count in the prompt", () => {
    const pageData = {
      departments: [{ department: "Marketing", headcount: 2, monthlyCost: 20000, members: [] }],
      plannedHires: 4,
    };

    const prompt = buildTeamPrompt(makeSnapshot(), pageData);

    expect(prompt).toContain("4");
  });
});
