import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ExpenseForm, type ExpenseRow } from "../expense-form";

const accounts = [
  { id: "acct-1", name: "AWS Hosting" },
  { id: "acct-2", name: "Office Rent" },
];

const departments = [
  { id: "dept-1", name: "Engineering" },
  { id: "dept-2", name: "Sales" },
];

const forecastLines = [
  { id: "line-1", name: "MRR" },
  { id: "line-2", name: "Headcount" },
];

describe("<ExpenseForm> add mode", () => {
  it("renders empty defaults and a fixed-method sub-form", () => {
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Method defaults to "fixed" → FixedFields rendered.
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    // Frequency defaults to monthly.
    expect(screen.getByRole("radio", { name: "Monthly" })).toHaveAttribute("aria-checked", "true");
    // Recurring defaults to auto.
    const autoRadio = screen.getByLabelText("Auto-detect (suggested)") as HTMLInputElement;
    expect(autoRadio.checked).toBe(true);
  });

  it("switches sub-form when method changes", () => {
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        forecastLines={forecastLines}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Forecast method"), { target: { value: "growth_rate" } });
    expect(screen.getByLabelText("Base amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly growth rate")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Forecast method"), { target: { value: "per_unit" } });
    expect(screen.getByLabelText("Units")).toBeInTheDocument();
    expect(screen.getByLabelText("Price per unit")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Forecast method"), { target: { value: "percentage_of" } });
    expect(screen.getByLabelText("Source forecast line")).toBeInTheDocument();
    expect(screen.getByLabelText("Percentage")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Forecast method"), { target: { value: "custom_formula" } });
    expect(screen.getByLabelText("Expression")).toBeInTheDocument();
  });

  it("resets parameters when switching method (no leak)", () => {
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Enter amount=100 in fixed.
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "100" } });
    expect(amountInput.value).toBe("100");

    // Switch to per_unit.
    fireEvent.change(screen.getByLabelText("Forecast method"), { target: { value: "per_unit" } });
    expect(screen.getByLabelText("Units")).toBeInTheDocument();

    // Switch back to fixed — amount should be reset to 0 (not 100).
    fireEvent.change(screen.getByLabelText("Forecast method"), { target: { value: "fixed" } });
    const resetAmount = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(resetAmount.value).toBe("0");
  });

  it("submits a normalized engine-aligned payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        departments={departments}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "acct-1" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Vendor (optional)"), { target: { value: "AWS" } });
    fireEvent.click(screen.getByRole("radio", { name: "Quarterly" }));
    fireEvent.click(screen.getByLabelText("Yes, recurring"));

    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Add expense" }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.method).toBe("fixed");
    expect(payload.parameters).toEqual({ amount: 250 });
    expect(payload.accountId).toBe("acct-1");
    expect(payload.frequency).toBe("quarterly");
    expect(payload.isRecurring).toBe(true);
    expect(payload.isOneTime).toBe(false);
    expect(payload.vendor).toBe("AWS");
    expect(payload.startDate).toBeInstanceOf(Date);
    expect(payload.endDate).toBeNull();
  });

  it("blocks submit when account is missing and surfaces an error", async () => {
    const onSubmit = vi.fn();
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Add expense" }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Account is required/);
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ExpenseForm
        mode="add"
        accounts={accounts}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("<ExpenseForm> edit mode", () => {
  const initialValue: ExpenseRow = {
    id: "line-9",
    accountId: "acct-2",
    method: "growth_rate",
    parameters: { baseAmount: 500, monthlyGrowthRate: 0.03 },
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    vendor: "Landlord LLC",
    notes: "Rent for HQ",
    frequency: "monthly",
    isOneTime: false,
    isRecurring: true,
    departmentId: "dept-1",
  };

  it("populates fields from initialValue", () => {
    render(
      <ExpenseForm
        mode="edit"
        initialValue={initialValue}
        accounts={accounts}
        departments={departments}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect((screen.getByLabelText("Forecast method") as HTMLSelectElement).value).toBe("growth_rate");
    expect((screen.getByLabelText("Base amount") as HTMLInputElement).value).toBe("500");
    expect((screen.getByLabelText("Monthly growth rate") as HTMLInputElement).value).toBe("0.03");
    expect((screen.getByLabelText("Vendor (optional)") as HTMLInputElement).value).toBe("Landlord LLC");
    expect((screen.getByLabelText("Notes (optional)") as HTMLTextAreaElement).value).toBe("Rent for HQ");
    expect((screen.getByLabelText("Yes, recurring") as HTMLInputElement).checked).toBe(true);
  });

  it("disables the account dropdown in edit mode", () => {
    render(
      <ExpenseForm
        mode="edit"
        initialValue={initialValue}
        accounts={accounts}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Account")).toBeDisabled();
  });

  it("includes id in the submit payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ExpenseForm
        mode="edit"
        initialValue={initialValue}
        accounts={accounts}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Edit expense" }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.id).toBe("line-9");
    expect(payload.method).toBe("growth_rate");
    expect(payload.parameters).toEqual({ baseAmount: 500, monthlyGrowthRate: 0.03 });
  });
});
