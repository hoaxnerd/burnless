// apps/web/src/app/(dashboard)/ai/_components/timeline/__tests__/plan-node.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanNode } from "../nodes/plan-node";
import type { PendingPlan } from "../../types";

const pending: PendingPlan = {
  pauseId: "p1", conversationId: "c1",
  spec: { title: "Model a hire", steps: [
    { id: "s1", kind: "tool", title: "Add hire", toolName: "create_headcount" },
    { id: "s2", kind: "note", title: "Recompute runway" },
  ] },
};

describe("PlanNode editing", () => {
  it("edits a step's title and submits the edited plan", () => {
    const onSubmit = vi.fn();
    render(<PlanNode pending={pending} disabled={false} onSubmit={onSubmit} />);
    const titleInput = screen.getByDisplayValue("Add hire");
    fireEvent.change(titleInput, { target: { value: "Add senior hire" } });
    fireEvent.click(screen.getByRole("button", { name: /proceed/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0] as { steps: { title: string }[] };
    expect(submitted.steps[0].title).toBe("Add senior hire");
  });

  it("removes a step", () => {
    const onSubmit = vi.fn();
    render(<PlanNode pending={pending} disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText("Remove step: Recompute runway"));
    fireEvent.click(screen.getByRole("button", { name: /proceed/i }));
    const submitted = onSubmit.mock.calls[0][0] as { steps: { id: string }[] };
    expect(submitted.steps.map((s) => s.id)).toEqual(["s1"]);
  });

  it("moves a step down (reorder)", () => {
    const onSubmit = vi.fn();
    render(<PlanNode pending={pending} disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText("Move step down: Add hire"));
    fireEvent.click(screen.getByRole("button", { name: /proceed/i }));
    const submitted = onSubmit.mock.calls[0][0] as { steps: { id: string }[] };
    expect(submitted.steps.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("shows a started state when resolved", () => {
    render(<PlanNode pending={{ ...pending, resolved: true }} disabled onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /started/i })).toBeDisabled();
  });
});
