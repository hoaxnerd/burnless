import { describe, it, expect, vi } from "vitest";
import type { McpToolInfo } from "@burnless/mcp";

// The module also exports a DB-backed entry point; stub its transitive deps
// (next-auth via ai-feature-flags, the postgres client via @burnless/db) so
// the pure core can be unit-tested without an environment.
vi.mock("@/lib/ai-feature-flags", () => ({ getAiFlags: vi.fn() }));
vi.mock("@burnless/db", () => ({
  listVisibleConnections: vi.fn(),
  listMcpToolPrefs: vi.fn(),
  getDisabledMcpConnectionIds: vi.fn(),
}));

import { assembleMcpToolsFromData, assembleMcpTools, DEFER_THRESHOLD } from "../mcp";
import { getAiFlags } from "@/lib/ai-feature-flags";
import { listVisibleConnections } from "@burnless/db";

const tool = (name: string, annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }): McpToolInfo => ({
  name, inputSchema: { type: "object", properties: {} }, ...(annotations ? { annotations } : {}),
});

const CONN = {
  id: "c1", slug: "stripe", status: "connected" as const,
  tools: [tool("list_invoices", { readOnlyHint: true }), tool("send_reminder"), tool("refund", { destructiveHint: true })],
  prefs: [] as Array<{ toolName: string; enabled: boolean; permClassOverride: "read" | "write" | "delete" | null }>,
};

describe("assembleMcpToolsFromData", () => {
  it("namespaces, classifies (D5), and maps categories", () => {
    const { tools, categories } = assembleMcpToolsFromData([CONN], []);
    expect(tools.map((t) => t.name)).toEqual([
      "mcp__stripe__list_invoices",
      "mcp__stripe__send_reminder",
      "mcp__stripe__refund",
    ]);
    expect(categories).toEqual({
      mcp__stripe__list_invoices: "read",
      mcp__stripe__send_reminder: "write",
      mcp__stripe__refund: "delete",
    });
  });

  it("D11: a disabled connection contributes NOTHING", () => {
    const { tools, categories } = assembleMcpToolsFromData([CONN], ["c1"]);
    expect(tools).toEqual([]);
    expect(categories).toEqual({});
  });

  it("skips non-connected connections and pref-disabled tools; applies overrides", () => {
    const conn = {
      ...CONN,
      prefs: [
        { toolName: "send_reminder", enabled: false, permClassOverride: null },
        { toolName: "list_invoices", enabled: true, permClassOverride: "write" as const },
      ],
    };
    const { tools, categories } = assembleMcpToolsFromData(
      [conn, { ...CONN, id: "c2", slug: "down", status: "error" as const }],
      []
    );
    expect(tools.map((t) => t.name)).toEqual(["mcp__stripe__list_invoices", "mcp__stripe__refund"]);
    expect(categories["mcp__stripe__list_invoices"]).toBe("write"); // override beats hint
  });

  it("defers large servers to two meta-tools (D6)", () => {
    const many = Array.from({ length: DEFER_THRESHOLD + 1 }, (_, i) => tool(`t${i}`, { readOnlyHint: true }));
    const { tools, categories } = assembleMcpToolsFromData([{ ...CONN, tools: many }], []);
    expect(tools.map((t) => t.name)).toEqual(["mcp__stripe__search_tools", "mcp__stripe__call_tool"]);
    expect(categories).toEqual({
      mcp__stripe__search_tools: "read",
      mcp__stripe__call_tool: "write", // conservative: meta-dispatch always asks
    });
    // the call_tool description tells the model how to use it
    expect(tools[1]!.description).toContain("search_tools");
  });
});

describe("assembleMcpTools — pre-fetched flags (no duplicate aiFeatureFlags read)", () => {
  it("uses the prefetched flags object and never calls getAiFlags", async () => {
    vi.mocked(getAiFlags).mockClear();
    vi.mocked(listVisibleConnections).mockResolvedValueOnce([] as never);

    const out = await assembleMcpTools("c1", "u1", { masterEnabled: true, features: {} });
    expect(out).toEqual({ tools: [], categories: {} });
    expect(getAiFlags).not.toHaveBeenCalled();
    expect(listVisibleConnections).toHaveBeenCalledWith("c1", "u1");
  });

  it("prefetched masterEnabled=false short-circuits without any DB reads", async () => {
    vi.mocked(getAiFlags).mockClear();
    vi.mocked(listVisibleConnections).mockClear();

    const out = await assembleMcpTools("c1", "u1", { masterEnabled: false, features: {} });
    expect(out).toEqual({ tools: [], categories: {} });
    expect(getAiFlags).not.toHaveBeenCalled();
    expect(listVisibleConnections).not.toHaveBeenCalled();
  });

  it("without prefetched flags it still falls back to getAiFlags", async () => {
    vi.mocked(getAiFlags).mockClear();
    vi.mocked(getAiFlags).mockResolvedValueOnce({ masterEnabled: false, features: {} } as never);

    const out = await assembleMcpTools("c1", "u1");
    expect(out).toEqual({ tools: [], categories: {} });
    expect(getAiFlags).toHaveBeenCalledWith("c1");
  });
});
