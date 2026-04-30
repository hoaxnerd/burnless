/**
 * Regression test: when an account is renamed (e.g., "Slack" → "Notion"), the
 * expense table must render the live account name from the supplied
 * accountMap rather than a stale field cached on the line item at compute
 * time.
 *
 * Phase 1 §2.C — rename-after-create fix in expense-table.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock useScenarioOverrides — the table calls it on mount but the rename
// scenario is independent of scenario mode.
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

// next/navigation is touched by the table for router.refresh().
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// apiFetch is referenced for category/delete actions; never invoked here.
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

import { ExpenseTable } from "../expense-table";
import type { ExpenseLineItem } from "@/lib/compute-expenses";

const baseItem: ExpenseLineItem = {
  id: "line-1",
  accountId: "a-1",
  // Cached at create-time. Should NOT win over a live accountMap lookup.
  accountName: "Slack",
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
  vendor: null,
  notes: null,
  departmentId: null,
};

describe("<ExpenseTable> rename-after-create", () => {
  it("renders the live account name from accountMap on first render", () => {
    const accountMap = new Map([
      ["a-1", { id: "a-1", name: "Slack" }],
    ]);

    render(
      <ExpenseTable
        lineItems={[baseItem]}
        subcategories={["Software"]}
        accountMap={accountMap}
      />,
    );

    // Row body shows the live name.
    expect(screen.getAllByText("Slack").length).toBeGreaterThan(0);
  });

  it("reflects the renamed account name when accountMap updates", () => {
    const initialMap = new Map([
      ["a-1", { id: "a-1", name: "Slack" }],
    ]);

    const { rerender } = render(
      <ExpenseTable
        lineItems={[baseItem]}
        subcategories={["Software"]}
        accountMap={initialMap}
      />,
    );
    expect(screen.getAllByText("Slack").length).toBeGreaterThan(0);

    // Simulate the user renaming the account upstream — the line item's
    // cached `accountName` is still "Slack", but accountMap is the truth.
    const renamedMap = new Map([
      ["a-1", { id: "a-1", name: "Notion" }],
    ]);
    rerender(
      <ExpenseTable
        lineItems={[baseItem]}
        subcategories={["Software"]}
        accountMap={renamedMap}
      />,
    );

    expect(screen.getAllByText("Notion").length).toBeGreaterThan(0);
    // Critically, the stale cached "Slack" must NOT appear anywhere in the
    // rendered table — that's the bug we're guarding against.
    expect(screen.queryByText("Slack")).toBeNull();
  });
});
