import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanPreviewCard } from "../plan-preview-card";

const pending = {
  pauseId: "p1", conversationId: "c1",
  spec: {
    title: "Model a hire",
    steps: [
      { id: "s1", kind: "tool" as const, title: "Add hire", toolName: "create_headcount" },
      { id: "s2", kind: "note" as const, title: "Recompute runway" },
    ],
  },
};

describe("PlanPreviewCard", () => {
  it("renders the steps and submits the (edited) plan on Proceed", () => {
    const onSubmit = vi.fn();
    render(<PlanPreviewCard pending={pending} onSubmit={onSubmit} disabled={false} />);
    expect(screen.getByText("Model a hire")).toBeInTheDocument();
    expect(screen.getByText("Add hire")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Remove step: Recompute runway"));
    fireEvent.click(screen.getByRole("button", { name: /proceed/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0]![0] as { steps: { id: string }[] };
    expect(submitted.steps.map((s) => s.id)).toEqual(["s1"]);
  });

  it("shows a submitted state when resolved", () => {
    render(<PlanPreviewCard pending={{ ...pending, resolved: true }} onSubmit={vi.fn()} disabled={true} />);
    expect(screen.getByRole("button", { name: /proceeding|started/i })).toBeDisabled();
  });
});
