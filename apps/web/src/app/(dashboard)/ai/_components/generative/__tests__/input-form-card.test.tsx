import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { InputFormCard } from "../input-form-card";
import type { PendingInputField } from "../../types";

const spec = {
  title: "Add a revenue stream",
  submitLabel: "Save",
  fields: [
    { name: "name", type: "text" as const, label: "Stream name", required: true, defaultValue: "Pro Plan" },
    { name: "monthlyAmount", type: "currency" as const, label: "Monthly amount", required: true, defaultValue: 4900 },
  ] satisfies PendingInputField[],
};

function wrap(ui: React.ReactNode) {
  return <LocaleProvider>{ui}</LocaleProvider>;
}

describe("InputFormCard", () => {
  it("prefills proposed defaults and submits collected data", () => {
    const onSubmit = vi.fn();
    render(
      wrap(
        <InputFormCard
          pending={{ pauseId: "p1", conversationId: "c1", spec }}
          onSubmit={onSubmit}
          disabled={false}
        />
      )
    );
    expect(screen.getByText("Add a revenue stream")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pro Plan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("4900")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Pro Plan", monthlyAmount: 4900 });
  });

  it("blocks submit when a required field is empty", () => {
    const onSubmit = vi.fn();
    const bareSpec = {
      title: "T",
      fields: [{ name: "name", type: "text" as const, label: "Name", required: true }] satisfies PendingInputField[],
    };
    render(
      wrap(
        <InputFormCard
          pending={{ pauseId: "p", conversationId: "c", spec: bareSpec }}
          onSubmit={onSubmit}
          disabled={false}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: /save|submit/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it("renders submitted state and disables the button when resolved", () => {
    const onSubmit = vi.fn();
    render(
      wrap(
        <InputFormCard
          pending={{ pauseId: "p1", conversationId: "c1", spec, resolved: true }}
          onSubmit={onSubmit}
          disabled={false}
        />
      )
    );
    const btn = screen.getByRole("button", { name: /submitted/i });
    expect(btn).toBeDisabled();
  });
});
