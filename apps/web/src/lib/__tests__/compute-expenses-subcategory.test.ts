import { describe, it, expect, vi } from "vitest";

// ── deriveSubcategory: explicit override wins ────────────────────────────────
import { deriveSubcategory } from "../compute-expenses";

describe("deriveSubcategory — explicit per-line override", () => {
  it("returns the explicit value (source manual, confidence 1) when provided", () => {
    const r = deriveSubcategory("Some Account", "operating_expense", "Marketing");
    expect(r.subcategory).toBe("Marketing");
    expect(r.source).toBe("manual");
    expect(r.confidence).toBe(1);
  });

  it("trims the explicit value", () => {
    const r = deriveSubcategory("acct", "operating_expense", "  Payroll  ");
    expect(r.subcategory).toBe("Payroll");
    expect(r.confidence).toBe(1);
  });

  it("falls back to derivation when explicit is null", () => {
    const r = deriveSubcategory("acct", "cogs", null);
    // COGS fallback path, not the explicit path.
    expect(r.subcategory).toBe("Cost of Goods Sold");
    expect(r.confidence).not.toBe(1);
  });

  it("falls back to derivation when explicit is an empty/whitespace string", () => {
    expect(deriveSubcategory("acct", "operating_expense", "").confidence).not.toBe(1);
    expect(deriveSubcategory("acct", "operating_expense", "   ").confidence).not.toBe(1);
  });

  it("falls back to derivation when explicit is undefined (back-compat)", () => {
    // No explicit arg → must NOT take the confidence-1 explicit path.
    const r = deriveSubcategory("Office Rent", "operating_expense");
    expect(r.confidence).not.toBe(1);
  });
});

// ── integration: explicit subcategory surfaces in the computed line item ─────

vi.mock("../compute-dashboard", () => ({
  computeDashboardData: vi.fn(async () => ({
    currentMonth: "2026-06",
    prevMonth: "2026-05",
    totalExpenses: new Map([["2026-06", 1000], ["2026-05", 1000]]),
    expenseLines: [],
  })),
}));
vi.mock("../data", () => ({
  getAccounts: vi.fn(async () => [
    { id: "acct-1", name: "Random Vendor XYZ", category: "operating_expense" },
  ]),
  getForecastLines: vi.fn(async () => [
    {
      id: "line-1",
      accountId: "acct-1",
      method: "fixed",
      parameters: { amount: 1000 },
      startDate: new Date("2026-01-01"),
      endDate: null,
      subcategory: "Legal & Compliance", // explicit per-line override
    },
  ]),
  getHeadcountPlans: vi.fn(async () => []),
}));

import { computeExpenseDetails } from "../compute-expenses";

describe("computeExpenseDetails — explicit subcategory surfaces", () => {
  it("uses the explicit override for the line item's category", async () => {
    const d = await computeExpenseDetails("co", null);
    const item = d.lineItems.find((l) => l.id === "line-1");
    expect(item).toBeTruthy();
    expect(item!.subcategory).toBe("Legal & Compliance");
    expect(item!.subcategoryOverride).toBe("Legal & Compliance");
    expect(item!.categorySource).toBe("manual");
    expect(item!.subcategoryConfidence).toBe(1);
  });
});
