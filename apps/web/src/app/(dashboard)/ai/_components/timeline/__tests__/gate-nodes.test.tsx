import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiffGateNode } from "../nodes/diff-gate-node";
import type { PendingPermission } from "../../types";

const pending: PendingPermission = {
  pauseId: "p1", conversationId: "c1",
  actions: [{ requestId: "t1", tool: "create_revenue_stream", category: "write", description: 'create revenue stream "X"', input: {}, override: [{ action: "create", entityType: "revenue_stream", entityId: "id1", before: null, after: { name: "X" } }] }],
};

describe("DiffGateNode", () => {
  it("renders the diff + forwards Apply as an 'once' decision", () => {
    const onDecide = vi.fn();
    render(<DiffGateNode pending={pending} onDecide={onDecide} />);
    expect(screen.getByText("X")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onDecide).toHaveBeenCalledWith(pending, [{ requestId: "t1", decision: "once" }]);
  });
});
