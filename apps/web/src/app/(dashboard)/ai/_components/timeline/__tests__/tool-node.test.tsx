// apps/web/src/app/(dashboard)/ai/_components/timeline/__tests__/tool-node.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolNode } from "../nodes/tool-node";

describe("ToolNode", () => {
  it("renders a humanized tool label + reflects phase", () => {
    const { rerender } = render(<ToolNode node={{ id: "t1", kind: "tool", toolName: "create_revenue_stream", phase: "running" }} />);
    expect(screen.getByText(/create revenue stream/i)).toBeTruthy();
    rerender(<ToolNode node={{ id: "t1", kind: "tool", toolName: "create_revenue_stream", phase: "done" }} />);
    expect(screen.getByText(/create revenue stream/i)).toBeTruthy();
  });
});
