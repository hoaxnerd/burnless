/**
 * Bulk-action UI tests for <ExpenseTable>.
 *
 * Phase 1 §2.C — Task 11: bulk delete + bulk categorize must
 *  1. Surface an action bar when N≥1 rows are selected.
 *  2. POST to /api/forecast-lines/bulk with the right payload.
 *  3. Clear selection + call router.refresh on success.
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
});

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
