/**
 * Phase 4 B Task 1 — Red test: Delete control must be rendered on rows
 * that have an active scenario override (overrideTag set).
 *
 * The current gate at expense-table.tsx:598-609 renders Edit-only (no Delete)
 * when overrideTag is truthy. This test proves that bug.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Wire up useScenarioOverrides to simulate an active "modify" override on
// expense-1. The overrideMap is a Map<entityId, OverrideInfo> as per the
// real hook's return shape (use-scenario-overrides.ts:93-104).
vi.mock("@/components/scenarios/use-scenario-overrides", () => ({
  useScenarioOverrides: () => ({
    isInScenarioMode: true,
    overrideMap: new Map([
      [
        "expense-1",
        {
          overrideId: "ov-1",
          entityId: "expense-1",
          action: "modify" as const,
          data: { id: "expense-1", method: "fixed", parameters: { amount: 5000 } },
        },
      ],
    ]),
    deletedEntities: [] as [],
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
  apiFetch: vi.fn(),
}));

import { ExpenseTable } from "../expense-table";
import type { ExpenseLineItem } from "@/lib/compute-expenses";

const overriddenItem: ExpenseLineItem = {
  id: "expense-1",
  accountId: "acc-1",
  accountName: "Cloud & Infrastructure",
  accountCategory: "operating_expense",
  subcategory: "Infrastructure",
  subcategoryConfidence: 0.9,
  categorySource: "rule",
  method: "fixed",
  parameters: { amount: 5000 },
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

describe("ExpenseTable — delete UX uniformity (Phase 4 B)", () => {
  it("renders Delete control on a row that has an active scenario override", () => {
    render(
      <ExpenseTable
        lineItems={[overriddenItem]}
        subcategories={[]}
        accountMap={new Map([["acc-1", { id: "acc-1", name: "Cloud & Infrastructure" }]])}
        departments={[]}
        forecastLines={[]}
      />,
    );

    // Delete control MUST be present even when overrideTag is set.
    expect(
      screen.getByRole("button", { name: /Delete Cloud & Infrastructure/i }),
    ).toBeInTheDocument();
  });
});
