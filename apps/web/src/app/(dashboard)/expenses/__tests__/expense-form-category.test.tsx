/**
 * expense-form-category.test.tsx
 *
 * The expense form must expose a per-entry Category field (set in create/edit),
 * not an inline list dropdown. Options = "Auto (derive from account)" first,
 * then the FULL canonical subcategory list from getCategorySubcategories().
 *   - Auto submits subcategory: null.
 *   - Picking a category submits that string.
 *   - A custom edit-row value not in the canonical list stays selectable.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { getCategorySubcategories } from "@burnless/engine";
import { ExpenseForm, type ExpenseRow } from "../expense-form";

const accounts = [
  { id: "acct-1", name: "AWS Hosting" },
  { id: "acct-2", name: "Office Rent" },
];

describe("<ExpenseForm> category field", () => {
  it("renders the wide canonical category list plus an Auto option", () => {
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);

    // Auto option first, with value "".
    expect(select.options[0]!.value).toBe("");
    expect(select.options[0]!.textContent).toMatch(/Auto/i);

    // Wide list — known canonical categories (incl. low/zero-spend ones) present.
    const canonical = getCategorySubcategories();
    expect(canonical).toContain("Software & Tools");
    expect(canonical).toContain("Legal & Compliance");
    expect(optionValues).toContain("Software & Tools");
    // The list is wide (more than a couple of top-spend buckets).
    expect(canonical.length).toBeGreaterThanOrEqual(10);
    // Every canonical entry is selectable.
    for (const c of canonical) expect(optionValues).toContain(c);
  });

  it("Auto (default) submits subcategory: null", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "acct-1" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });

    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Add expense" }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0].subcategory).toBeNull();
  });

  it("picking a category sets it in the submit payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "acct-1" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Software & Tools" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Add expense" }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0].subcategory).toBe("Software & Tools");
  });

  it("edit mode preselects the row's existing override and keeps a custom value selectable", () => {
    const row: ExpenseRow = {
      id: "line-1",
      accountId: "acct-1",
      method: "fixed",
      parameters: { amount: 500 },
      startDate: "2026-01-01",
      endDate: null,
      subcategory: "My Custom Bucket",
    };
    render(
      <ExpenseForm
        mode="edit"
        accounts={accounts}
        initialValue={row}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    expect(select.value).toBe("My Custom Bucket");
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain("My Custom Bucket");
  });

  it("edit mode with no override preselects Auto", () => {
    const row: ExpenseRow = {
      id: "line-1",
      accountId: "acct-1",
      method: "fixed",
      parameters: { amount: 500 },
      startDate: "2026-01-01",
      endDate: null,
      subcategory: null,
    };
    render(
      <ExpenseForm
        mode="edit"
        accounts={accounts}
        initialValue={row}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    expect(select.value).toBe("");
  });
});
