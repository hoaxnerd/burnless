import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardShell } from "../wizard-shell";

const steps = [
  { id: "company", label: "Company" }, { id: "revenue", label: "Revenue" },
  { id: "funding", label: "Funding" }, { id: "expenses", label: "Expenses" }, { id: "team", label: "Team" },
];

describe("WizardShell", () => {
  it("marks done/active steps and fires nav callbacks", () => {
    const onBack = vi.fn(), onSkip = vi.fn(), onContinue = vi.fn();
    render(<WizardShell steps={steps} activeId="revenue" canContinue isLast={false}
      onBack={onBack} onSkip={onSkip} onContinue={onContinue}><div>panel</div></WizardShell>);
    expect(screen.getByText("panel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /skip this step/i }));
    expect(onSkip).toHaveBeenCalled();
  });
  it("shows Finish on the last step and disables Continue when canContinue=false", () => {
    render(<WizardShell steps={steps} activeId="team" canContinue={false} isLast
      onBack={()=>{}} onSkip={()=>{}} onContinue={()=>{}}><div/></WizardShell>);
    const finish = screen.getByRole("button", { name: /finish|go to dashboard/i });
    expect(finish).toBeDisabled();
  });
});
