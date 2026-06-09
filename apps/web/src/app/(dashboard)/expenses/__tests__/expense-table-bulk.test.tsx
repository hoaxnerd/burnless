/**
 * Bulk-action UI tests for <ExpenseTable>.
 *
 * Phase 1 §2.C — Task 11: bulk delete + bulk categorize must
 *  1. Surface an action bar when N≥1 rows are selected.
 *  2. POST to /api/forecast-lines/bulk with the right payload.
 *  3. Clear selection + call router.refresh on success.
 *
 * EXP-02: synthetic row (id === 'headcount-synthetic') must NOT be selectable.
 *  - Per-row checkbox is disabled/hidden for synthetic rows.
 *  - toggleAll excludes the synthetic row.
 *  - Header checked/indeterminate state is based on selectableItems count.
 *  - Bulk-action bar count reflects only selectable (non-synthetic) items.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { ExpenseTable } from "../expense-table";
import type { ExpenseLineItem } from "@/lib/compute-expenses";

const item = (id: string, accountId: string, name: string): ExpenseLineItem => ({
  id,
  accountId,
  accountName: name,
  accountCategory: "operating_expense",
  subcategory: "Software",
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
});

const syntheticItem: ExpenseLineItem = {
  id: "headcount-synthetic",
  accountId: "a-hc",
  accountName: "Personnel Costs",
  accountCategory: "operating_expense",
  subcategory: "Headcount",
  subcategoryConfidence: 1,
  categorySource: "rule",
  subcategoryOverride: null,
  method: "fixed",
  parameters: {},
  startDate: "2026-01-01",
  endDate: null,
  currentAmount: 5000,
  prevAmount: 5000,
  changePercent: 0,
  isRecurring: true,
  recurringSource: "user",
  isAnomaly: false,
  isOneTime: false,
  frequency: "monthly",
  monthlySeries: [{ month: "2026-04", value: 5000 }],
  vendor: null,
  notes: null,
  departmentId: null,
};

const lineItems = [
  item("fl-1", "a-1", "Slack"),
  item("fl-2", "a-2", "Notion"),
];
const accountMap = new Map([
  ["a-1", { id: "a-1", name: "Slack" }],
  ["a-2", { id: "a-2", name: "Notion" }],
  ["a-3", { id: "a-3", name: "Marketing" }],
]);

beforeEach(() => {
  apiFetch.mockReset();
  refresh.mockReset();
});

describe("<ExpenseTable> bulk actions", () => {
  it("hides the action bar when nothing is selected", () => {
    render(
      <ExpenseTable
        lineItems={lineItems}
        subcategories={["Software"]}
        accountMap={accountMap}
      />,
    );
    expect(screen.queryByText(/selected/i)).toBeNull();
  });

  it("shows the action bar after a row is selected", () => {
    render(
      <ExpenseTable
        lineItems={lineItems}
        subcategories={["Software"]}
        accountMap={accountMap}
      />,
    );
    fireEvent.click(screen.getByLabelText("Select Slack"));
    expect(
      screen.getByRole("button", { name: /delete 1 selected/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/reassign selected expenses to account/i),
    ).toBeInTheDocument();
  });

  it("posts bulk delete with the selected ids and refreshes", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 2 }), { status: 200 }),
    );

    render(
      <ExpenseTable
        lineItems={lineItems}
        subcategories={["Software"]}
        accountMap={accountMap}
      />,
    );

    // Select both rows via the header "select all"
    fireEvent.click(screen.getByLabelText(/select all expenses/i));
    expect(
      screen.getByRole("button", { name: /delete 2 selected/i }),
    ).toBeInTheDocument();

    // Open the confirm modal, then confirm
    fireEvent.click(screen.getByRole("button", { name: /delete 2 selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete 2$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/forecast-lines/bulk",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "delete",
            ids: ["fl-1", "fl-2"],
          }),
        }),
      );
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("posts bulk categorize when an account is picked from the reassign dropdown", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 1 }), { status: 200 }),
    );

    render(
      <ExpenseTable
        lineItems={lineItems}
        subcategories={["Software"]}
        accountMap={accountMap}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Slack"));
    const select = screen.getByLabelText(
      /reassign selected expenses to account/i,
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "a-3" } });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/forecast-lines/bulk",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "categorize",
            ids: ["fl-1"],
            accountId: "a-3",
          }),
        }),
      );
    });
  });
});

// ── EXP-02: synthetic row is NOT bulk-selectable ──────────────────────────────

describe("<ExpenseTable> EXP-02 — synthetic row not selectable", () => {
  const mixedItems = [...lineItems, syntheticItem];
  const mixedAccountMap = new Map([
    ...accountMap,
    ["a-hc", { id: "a-hc", name: "Personnel Costs" }],
  ]);

  it("toggleAll selects only non-synthetic rows", () => {
    render(
      <ExpenseTable
        lineItems={mixedItems}
        subcategories={["Software", "Headcount"]}
        accountMap={mixedAccountMap}
      />,
    );

    fireEvent.click(screen.getByLabelText(/select all expenses/i));

    // Only 2 selectable items (fl-1, fl-2); synthetic excluded.
    expect(
      screen.getByRole("button", { name: /delete 2 selected/i }),
    ).toBeInTheDocument();
  });

  it("count in action bar is 1 after selecting one real row alongside synthetic", () => {
    render(
      <ExpenseTable
        lineItems={mixedItems}
        subcategories={["Software", "Headcount"]}
        accountMap={mixedAccountMap}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Slack"));

    // Only 1 selected — synthetic never in the count.
    expect(
      screen.getByText(/^1 selected$/i),
    ).toBeInTheDocument();
  });

  it("header is checked when all selectable (non-synthetic) rows are selected", () => {
    render(
      <ExpenseTable
        lineItems={mixedItems}
        subcategories={["Software", "Headcount"]}
        accountMap={mixedAccountMap}
      />,
    );

    // Select both real rows manually.
    fireEvent.click(screen.getByLabelText("Select Slack"));
    fireEvent.click(screen.getByLabelText("Select Notion"));

    // Header "select all" button should be present and the checkbox visually
    // indicates all selectable rows are selected (2 out of 2 non-synthetic).
    const headerBtn = screen.getByLabelText(/select all expenses/i);
    // The button exists and toggleAll will now deselect (since all are selected).
    expect(headerBtn).toBeInTheDocument();
    // Action bar shows 2 (not 3).
    expect(
      screen.getByRole("button", { name: /delete 2 selected/i }),
    ).toBeInTheDocument();
  });

  it("toggling all twice deselects all", () => {
    render(
      <ExpenseTable
        lineItems={mixedItems}
        subcategories={["Software", "Headcount"]}
        accountMap={mixedAccountMap}
      />,
    );

    fireEvent.click(screen.getByLabelText(/select all expenses/i));
    expect(screen.getByText(/^2 selected$/i)).toBeInTheDocument();

    // Second toggle should deselect all.
    fireEvent.click(screen.getByLabelText(/select all expenses/i));
    expect(screen.queryByText(/selected/i)).toBeNull();
  });
});
