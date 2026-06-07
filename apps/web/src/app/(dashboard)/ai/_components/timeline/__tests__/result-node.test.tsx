// apps/web/src/app/(dashboard)/ai/_components/timeline/__tests__/result-node.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultNode } from "../nodes/result-node";
import type { TimelineNodeClient } from "../../types";

describe("ResultNode", () => {
  it("renders streamed text", () => {
    const node: TimelineNodeClient = { id: "r1", kind: "result", text: "Your runway is healthy." };
    render(<ResultNode node={node} />);
    expect(screen.getByText(/runway is healthy/i)).toBeTruthy();
  });

  it("renders a genui block + confidence chip when present", () => {
    const node: TimelineNodeClient = { id: "r2", kind: "result", block: { id: "b1", component: "callout", props: { severity: "info", title: "Note", body: "x" } }, confidence: "high", rationale: "because you said X" };
    render(<ResultNode node={node} />);
    expect(screen.getByText(/high confidence/i)).toBeTruthy();
    expect(screen.getByText(/because you said X/i)).toBeTruthy();
  });
});
