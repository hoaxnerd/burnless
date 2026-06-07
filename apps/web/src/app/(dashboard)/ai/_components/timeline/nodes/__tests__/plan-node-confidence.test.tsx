import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanNode } from "../plan-node";
import type { PendingPlan } from "../../../types";

const pending: PendingPlan = {
  pauseId: "p1",
  conversationId: "cv1",
  spec: {
    title: "Hire plan",
    steps: [
      { id: "step-1", kind: "tool", title: "Add senior eng", toolName: "create_headcount", confidence: "low", rationale: "because budget is tight" },
      { id: "step-2", kind: "note", title: "Review runway" },
    ],
  },
};

describe("PlanNode confidence chip (Plan 5)", () => {
  it("shows a Low chip for a step with low confidence", () => {
    render(<PlanNode pending={pending} disabled onSubmit={() => {}} />);
    expect(screen.getByText(/low/i)).toBeTruthy();
  });

  it("renders steps without a confidence field cleanly", () => {
    render(<PlanNode pending={pending} disabled onSubmit={() => {}} />);
    expect(screen.getByText("Review runway")).toBeTruthy();
  });
});
