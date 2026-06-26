import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountsView } from "../accounts-view";
import type { FinancialAccount } from "@/lib/swr";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function acc(over: Partial<FinancialAccount>): FinancialAccount {
  return {
    id: "a", companyId: "c1", name: "Acc", type: "expense", category: "operating_expense",
    parentId: null, isSystem: false, sortOrder: 0, coversHeadcount: false, transactionCount: 0,
    createdAt: "2026-06-25", updatedAt: "2026-06-25", ...over,
  };
}

describe("AccountsView", () => {
  const accounts = [
    acc({ id: "sys", name: "Revenue", isSystem: true, transactionCount: 0 }),
    acc({ id: "busy", name: "Cash & Bank", isSystem: false, transactionCount: 12 }),
    acc({ id: "free", name: "Marketing", isSystem: false, transactionCount: 0 }),
  ];

  it("renders a row per account with name and transaction count", () => {
    render(<AccountsView accounts={accounts} />);
    expect(screen.getByText("Revenue")).toBeTruthy();
    expect(screen.getByText("Cash & Bank")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("shows the back-link to Transactions and the Add Account CTA", () => {
    render(<AccountsView accounts={accounts} />);
    expect(screen.getByRole("link", { name: /back to transactions/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /add account/i })).toBeTruthy();
  });

  it("hides the delete affordance for system and non-empty accounts, shows it for a clean account", () => {
    render(<AccountsView accounts={accounts} />);
    // Only the clean, non-system account ("Marketing") gets an ENABLED Delete affordance.
    // Exact-string name matchers (full accessible-name match) so the enabled "Delete account"
    // is NOT confused with the disabled "Delete account (unavailable)".
    expect(screen.getAllByRole("button", { name: "Delete account" })).toHaveLength(1);
    // Edit is available on every row.
    expect(screen.getAllByRole("button", { name: "Edit account" })).toHaveLength(3);
  });
});
