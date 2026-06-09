/**
 * EXP-05: filter-aware empty-state in <ExpenseTable>.
 *
 * When a filter (search / category / type) is active and produces zero rows
 * the secondary empty-state text must say "broaden / clear filters", NOT
 * "Add expenses to start tracking spend." (which implies the user has no data).
 *
 * EXP-06: inline per-row re-categorize select includes full category list.
 *
 * A zero-spend category (one present in lineItems but absent from the
 * spend-ordered `subcategories` prop) must appear in the inline select.
 * The select must also pre-select the row's current category.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/scenarios/use-scenario-overrides", () => ({
  useScenarioOverrides: () => ({
    isInScenarioMode: false,
    overrideMap: new Map(),
    deletedEntities: [],
    isLoading: false,
    handleRevert: vi.fn(),
    handleRemove: vi.fn(),
    handleRestore: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
}));

import { ExpenseTable } from "../expense-table";
import type { ExpenseLineItem } from "@/lib/compute-expenses";

const mkItem = (
  id: string,
  name: string,
  subcategory: string,
  isRecurring = false,
  isAnomaly = false,
): ExpenseLineItem => ({
  id,
  accountId: `acc-${id}`,
  accountName: name,
  accountCategory: "operating_expense",
  subcategory,
  subcategoryConfidence: 0.9,
  categorySource: "rule",
  subcategoryOverride: null,
  method: "fixed",
  parameters: {},
  startDate: "2026-01-01",
  endDate: null,
  currentAmount: 100,
  prevAmount: 100,
  changePercent: 0,
  isRecurring,
  recurringSource: "user",
  isAnomaly,
  isOneTime: false,
  frequency: "monthly",
  monthlySeries: [{ month: "2026-04", value: 100 }],
  vendor: null,
  notes: null,
  departmentId: null,
});

// ── EXP-05: empty-state guidance ──────────────────────────────────────────────

describe("<ExpenseTable> EXP-05 — filter-aware empty state", () => {
  it("shows add-data CTA when there are genuinely no line items", () => {
    render(
      <ExpenseTable
        lineItems={[]}
        subcategories={[]}
        accountMap={new Map()}
      />,
    );
    expect(
      screen.getByText(/Add expenses to start tracking spend\./i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/broaden|clear filter/i),
    ).toBeNull();
  });

  it("shows broaden/clear guidance when a search term yields no rows", () => {
    const item = mkItem("1", "Slack", "Software");
    render(
      <ExpenseTable
        lineItems={[item]}
        subcategories={["Software"]}
        accountMap={new Map([["acc-1", { id: "acc-1", name: "Slack" }]])}
      />,
    );

    // Search for something that won't match any item.
    fireEvent.change(screen.getByLabelText(/search expenses/i), {
      target: { value: "zzz-no-match" },
    });

    expect(screen.getByText(/No expenses match your filters\./i)).toBeInTheDocument();
    // Secondary text must be broaden, NOT add-data CTA.
    expect(
      screen.getByText(/broadening your search or clearing filters/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Add expenses to start tracking spend\./i),
    ).toBeNull();
  });

  it("shows broaden/clear guidance when category filter yields no rows", () => {
    // Item is "Software"; we filter by "Marketing" (no match).
    const item = mkItem("1", "Slack", "Software");
    render(
      <ExpenseTable
        lineItems={[item]}
        subcategories={["Software", "Marketing"]}
        accountMap={new Map([["acc-1", { id: "acc-1", name: "Slack" }]])}
      />,
    );

    fireEvent.change(screen.getByLabelText(/filter by category/i), {
      target: { value: "Marketing" },
    });

    expect(screen.getByText(/No expenses match your filters\./i)).toBeInTheDocument();
    expect(
      screen.getByText(/broadening your search or clearing filters/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Add expenses to start tracking spend\./i),
    ).toBeNull();
  });

  it("shows add-data CTA when category filter is cleared back to 'all' with no items", () => {
    // No items at all — genuine empty state should show add-data CTA.
    render(
      <ExpenseTable
        lineItems={[]}
        subcategories={["Software"]}
        accountMap={new Map()}
      />,
    );

    // No filter active, genuinely no data.
    expect(
      screen.getByText(/Add expenses to start tracking spend\./i),
    ).toBeInTheDocument();
  });
});

// ── Category is read-only in the table (set in the expense form) ──────────────
// The former EXP-06 inline per-row re-categorize select has been removed.
// Reaching low/zero-spend categories is now handled by the form's wide canonical
// list (see expense-form-category.test.tsx). Here we guard that the table renders
// the category read-only with NO inline edit affordance.

describe("<ExpenseTable> category is read-only", () => {
  const cogsItem = mkItem("cogs-1", "AWS COGS", "COGS");
  const accountMap = new Map([
    ["acc-cogs-1", { id: "acc-cogs-1", name: "AWS COGS" }],
  ]);
  const topNSubcategories = ["Software", "Marketing", "Infrastructure"];

  it("renders the category text but offers no inline edit control", () => {
    render(
      <ExpenseTable
        lineItems={[cogsItem]}
        subcategories={topNSubcategories}
        accountMap={accountMap}
      />,
    );

    // Category is shown.
    expect(screen.getAllByText("COGS").length).toBeGreaterThan(0);
    // No clickable category badge / inline select.
    expect(screen.queryByRole("button", { name: "COGS" })).toBeNull();
    expect(screen.queryByLabelText(/change category for/i)).toBeNull();
  });
});
