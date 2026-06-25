import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock apiFetch before importing the component — fired-submit tests assert on it.
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

// router.refresh() runs on the success path; capture it so we can assert it fired.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { apiFetch } from "@/lib/api-fetch";
import { TransactionFormModal } from "../transaction-form-modal";

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const accounts = [{ id: "acc-1", name: "Cash & Bank" }, { id: "acc-2", name: "Revenue" }];

/** Parse the JSON body passed to a given apiFetch call. */
function bodyOf(call: [string, RequestInit?]): Record<string, unknown> {
  return JSON.parse(String(call[1]?.body));
}

describe("TransactionFormModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
  });

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

  it("add mode submit issues POST /api/transactions with accountId/date/amount", async () => {
    render(<TransactionFormModal mode="add" accounts={accounts} />);

    // Open the modal via the trigger button.
    await userEvent.click(screen.getByRole("button", { name: /add transaction/i }));

    // Account defaults to the first account and date defaults to today; set amount.
    const amount = screen.getByLabelText(/amount/i);
    fireEvent.change(amount, { target: { value: "250" } });

    // Submit the form.
    fireEvent.submit(screen.getByRole("form", { name: /add transaction/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const call = mockApiFetch.mock.calls[0] as [string, RequestInit?];
    expect(call[0]).toBe("/api/transactions");
    expect(call[1]).toEqual(expect.objectContaining({ method: "POST" }));

    const body = bodyOf(call);
    expect(body).toHaveProperty("accountId", "acc-1");
    expect(body).toHaveProperty("date");
    expect(body.date).toBeTruthy();
    expect(body).toHaveProperty("amount", 250);

    // Success path ran: router.refresh() was called.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("edit mode submit issues PATCH /api/transactions/:id and omits notes (schema is .partial())", async () => {
    const onClose = vi.fn();
    render(
      <TransactionFormModal
        mode="edit"
        accounts={accounts}
        open
        onClose={onClose}
        initialValue={{ id: "t1", accountId: "acc-1", date: "2026-01-01", amount: "100.00", description: "Lunch", vendor: "Acme", notes: null }}
      />,
    );

    fireEvent.submit(screen.getByRole("form", { name: /edit transaction/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const call = mockApiFetch.mock.calls[0] as [string, RequestInit?];
    expect(call[0]).toBe("/api/transactions/t1");
    expect(call[1]).toEqual(expect.objectContaining({ method: "PATCH" }));

    // Edit succeeds WITHOUT `notes` — updateTransactionSchema is `.partial()`, so an
    // omitted field is valid and simply preserved by the route's `values = {...data}`.
    const body = bodyOf(call);
    expect(body).not.toHaveProperty("notes");

    // Success path ran: modal closed and router.refresh() was called.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });
});
