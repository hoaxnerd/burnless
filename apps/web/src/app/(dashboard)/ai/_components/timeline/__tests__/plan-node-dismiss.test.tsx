// AI-02: PlanNode renders a Dismiss ghost button (advisory plan, not a write gate)
// and calls onDismiss when clicked. No server resume happens — purely local.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanNode } from "../nodes/plan-node";
import type { PendingPlan } from "../../types";

const pending: PendingPlan = {
  pauseId: "p1",
  conversationId: "c1",
  spec: {
    title: "Model a hire",
    steps: [{ id: "s1", kind: "tool", title: "Add hire", toolName: "create_headcount" }],
  },
};

describe("PlanNode dismiss (AI-02)", () => {
  it("renders a Dismiss button and calls onDismiss when clicked", () => {
    const onDismiss = vi.fn();
    render(<PlanNode pending={pending} disabled={false} onSubmit={vi.fn()} onDismiss={onDismiss} />);
    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render Dismiss when no onDismiss prop is given", () => {
    render(<PlanNode pending={pending} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("hides Dismiss once the plan is resolved", () => {
    const onDismiss = vi.fn();
    render(<PlanNode pending={{ ...pending, resolved: true }} disabled onSubmit={vi.fn()} onDismiss={onDismiss} />);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
    // The Proceed button now reads "Started" and is disabled.
    expect(screen.getByRole("button", { name: /started/i })).toBeDisabled();
  });
});
