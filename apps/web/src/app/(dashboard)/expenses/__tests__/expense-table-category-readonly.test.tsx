/**
 * The inline per-row category editor has been removed. Category is now set in
 * the expense FORM (create/edit). The table must:
 *   - render the category read-only (no editable <select>, no "click to change"
 *     button affordance),
 *   - never POST to /api/merchant-mappings from the row.
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

const apiFetch = vi.fn();
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { ExpenseTable } from "../expense-table";
import type { ExpenseLineItem } from "@/lib/compute-expenses";

const baseItem: ExpenseLineItem = {
  id: "line-1",
  accountId: "a-1",
  accountName: "AWS",
  accountCategory: "operating_expense",
  subcategory: "Software & Tools",
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
  isRecurring: true,
  recurringSource: "user",
  isAnomaly: false,
  isOneTime: false,
  frequency: "monthly",
  monthlySeries: [{ month: "2026-04", value: 100 }],
  vendor: null,
  notes: null,
  departmentId: null,
};

describe("<ExpenseTable> read-only category", () => {
  it("displays the category but offers no inline edit affordance", () => {
    render(
      <ExpenseTable
        lineItems={[baseItem]}
        subcategories={["Software & Tools"]}
        accountMap={new Map([["a-1", { id: "a-1", name: "AWS" }]])}
      />,
    );

    // Category text is shown (appears at least once: the row chip).
    expect(screen.getAllByText("Software & Tools").length).toBeGreaterThan(0);

    // No per-row "change category" control.
    expect(screen.queryByLabelText(/Change category for/i)).toBeNull();
    expect(screen.queryByTitle("Click to change category")).toBeNull();
  });

  it("never POSTs to /api/merchant-mappings from the row", () => {
    render(
      <ExpenseTable
        lineItems={[baseItem]}
        subcategories={["Software & Tools"]}
        accountMap={new Map([["a-1", { id: "a-1", name: "AWS" }]])}
      />,
    );

    // Clicking the (now static) category label must not trigger any network call.
    const chip = screen.getAllByText("Software & Tools")[0]!;
    fireEvent.click(chip);

    const merchantCalls = apiFetch.mock.calls.filter(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("/api/merchant-mappings"),
    );
    expect(merchantCalls.length).toBe(0);
  });

  it("shows a Manual badge when the category is an explicit override", () => {
    render(
      <ExpenseTable
        lineItems={[{ ...baseItem, subcategory: "Legal & Compliance", subcategoryOverride: "Legal & Compliance" }]}
        subcategories={["Legal & Compliance"]}
        accountMap={new Map([["a-1", { id: "a-1", name: "AWS" }]])}
      />,
    );
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
});
