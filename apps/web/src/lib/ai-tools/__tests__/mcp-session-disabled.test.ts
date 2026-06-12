import { describe, it, expect, vi } from "vitest";
import type { McpToolInfo } from "@burnless/mcp";

// Stub transitive deps so the pure core is unit-testable without an environment.
vi.mock("@/lib/ai-feature-flags", () => ({ getAiFlags: vi.fn() }));
vi.mock("@burnless/db", () => ({
  listVisibleConnections: vi.fn(),
  listMcpToolPrefs: vi.fn(),
  getDisabledMcpConnectionIds: vi.fn(),
}));

import { assembleMcpToolsFromData } from "../mcp";

const tool = (name: string, annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }): McpToolInfo => ({
  name,
  inputSchema: { type: "object", properties: {} },
  ...(annotations ? { annotations } : {}),
});

const CONN = {
  id: "c1",
  slug: "stripe",
  status: "connected" as const,
  tools: [tool("list_invoices", { readOnlyHint: true }), tool("send_reminder"), tool("refund", { destructiveHint: true })],
  prefs: [] as Array<{ toolName: string; enabled: boolean; permClassOverride: "read" | "write" | "delete" | null }>,
};

describe("assembleMcpToolsFromData sessionDisabled", () => {
  it("with no sessionDisabled, behaves as before", () => {
    const { tools } = assembleMcpToolsFromData([CONN], [], {});
    expect(tools.map((t) => t.name)).toEqual([
      "mcp__stripe__list_invoices",
      "mcp__stripe__send_reminder",
      "mcp__stripe__refund",
    ]);
  });

  it("drops a session-disabled connection (conn:<id>)", () => {
    const { tools, categories } = assembleMcpToolsFromData([CONN], [], { "conn:c1": true });
    expect(tools).toEqual([]);
    expect(categories).toEqual({});
  });

  it("drops a session-disabled tool (conntool:<id>:<tool>) leaving siblings", () => {
    const { tools } = assembleMcpToolsFromData([CONN], [], { "conntool:c1:send_reminder": true });
    expect(tools.map((t) => t.name)).toEqual([
      "mcp__stripe__list_invoices",
      "mcp__stripe__refund",
    ]);
  });

  it("session-disabled is applied IN ADDITION to permanent disabledIds", () => {
    // Permanent disable of c1 still wins even when session map only targets a tool.
    const { tools } = assembleMcpToolsFromData([CONN], ["c1"], { "conntool:c1:refund": true });
    expect(tools).toEqual([]);
  });
});
