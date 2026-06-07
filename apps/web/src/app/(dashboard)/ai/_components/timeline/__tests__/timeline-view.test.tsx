// apps/web/src/app/(dashboard)/ai/_components/timeline/__tests__/timeline-view.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineView } from "../timeline-view";
import type { TimelineNodeClient } from "../../types";

const nodes: TimelineNodeClient[] = [
  { id: "p1", kind: "plan", plan: { pauseId: "p1", conversationId: "c1", spec: { title: "Plan X", steps: [] } } },
  { id: "t1", kind: "tool", toolName: "create_revenue_stream", phase: "done" },
  { id: "g1", kind: "diff_gate", pending: { pauseId: "g1", conversationId: "c1", actions: [{ requestId: "r", tool: "create_revenue_stream", category: "write", description: "create revenue stream", input: {} }] } },
  { id: "r1", kind: "result", text: "All done." },
];

describe("TimelineView", () => {
  it("renders all node kinds in order on a rail", () => {
    render(<TimelineView nodes={nodes} disabled={false} onPlanSubmit={vi.fn()} onDecide={vi.fn()} onInputSubmit={vi.fn()} onAction={vi.fn()} />);
    expect(screen.getByText("Plan X")).toBeTruthy();
    // Both the tool node (humanized "Create Revenue Stream") and the in-stream
    // diff_gate's PermissionCard surface this label — assert at least one renders.
    expect(screen.getAllByText(/create revenue stream/i).length).toBeGreaterThan(0);
    expect(screen.getByText("All done.")).toBeTruthy();
  });
});
