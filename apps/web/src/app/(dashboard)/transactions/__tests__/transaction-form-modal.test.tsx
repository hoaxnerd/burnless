import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionFormModal } from "../transaction-form-modal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const accounts = [{ id: "acc-1", name: "Cash & Bank" }, { id: "acc-2", name: "Revenue" }];

describe("TransactionFormModal", () => {
  it("add mode renders an 'Add Transaction' trigger button", () => {
    render(<TransactionFormModal mode="add" accounts={accounts} />);
    expect(screen.getByRole("button", { name: /add transaction/i })).toBeTruthy();
  });

  it("edit mode renders the open modal with the account options", () => {
    render(
      <TransactionFormModal
        mode="edit"
        accounts={accounts}
        open
        onClose={() => {}}
        initialValue={{ id: "t1", accountId: "acc-1", date: "2026-01-01", amount: "100.00", description: "Lunch", vendor: "Acme", notes: null }}
      />,
    );
    // Modal title surfaces "Edit Transaction"
    expect(screen.getByText(/edit transaction/i)).toBeTruthy();
    // Account select carries both options
    expect(screen.getByRole("option", { name: "Cash & Bank" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Revenue" })).toBeTruthy();
  });
});
