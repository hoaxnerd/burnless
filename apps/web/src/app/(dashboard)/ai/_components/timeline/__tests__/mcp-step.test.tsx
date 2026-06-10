// apps/web/src/app/(dashboard)/ai/_components/timeline/__tests__/mcp-step.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolNode } from "../nodes/tool-node";

describe("ToolNode — MCP tool display (tools-in-chat.html .step)", () => {
  it("renders source chip, bare tool name and MCP badge for a namespaced MCP tool", () => {
    render(
      <ToolNode
        node={{ id: "t1", kind: "tool", toolName: "mcp__stripe__list_invoices", phase: "done" }}
      />,
    );
    expect(screen.getByText("stripe")).toBeTruthy(); // source chip
    expect(screen.getByText("list_invoices")).toBeTruthy(); // bare tool name (not humanized)
    expect(screen.getByText("MCP")).toBeTruthy(); // violet MCP badge
  });

  it("renders the read/write/delete tag when category is provided", () => {
    render(
      <ToolNode
        node={{
          id: "t2",
          kind: "tool",
          toolName: "mcp__stripe__refund_charge",
          phase: "done",
          category: "delete",
        }}
      />,
    );
    expect(screen.getByText("delete")).toBeTruthy();
  });

  it("renders no MCP badge or chip for a native tool — label unchanged", () => {
    render(
      <ToolNode node={{ id: "t3", kind: "tool", toolName: "create_scenario", phase: "done" }} />,
    );
    expect(screen.queryByText("MCP")).toBeNull();
    expect(screen.getByText(/create scenario/i)).toBeTruthy();
  });
});
