import { describe, it, expect, vi } from "vitest";

// `../mcp` also exports DB-backed entry points; stub their transitive deps
// (next-auth via ai-feature-flags, the postgres client via @burnless/db) so
// the injected-deps core can be unit-tested without an environment — same
// convention as mcp-assembly.test.ts.
vi.mock("@/lib/ai-feature-flags", () => ({ getAiFlags: vi.fn() }));
vi.mock("@burnless/db", () => ({
  listVisibleConnections: vi.fn(),
  listMcpToolPrefs: vi.fn(),
  getDisabledMcpConnectionIds: vi.fn(),
  getDecryptedMcpSecret: vi.fn(),
  aiToolAuditLogs: {},
  db: { insert: vi.fn() },
}));

import { executeMcpToolWith } from "../mcp";

const CONN_ROW = {
  id: "c1", slug: "stripe", status: "connected", transport: "streamable_http" as const,
  endpoint: "https://mcp.stripe.com", args: null, env: null, authType: "pat" as const,
  capabilities: { tools: [
    { name: "list_invoices", description: "List", inputSchema: { type: "object", properties: {} } },
    { name: "send_reminder", inputSchema: { type: "object", properties: {} } },
  ] },
};

function deps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findConnectionBySlug: vi.fn().mockResolvedValue(CONN_ROW),
    getSecret: vi.fn().mockResolvedValue({ token: "t" }),
    callTool: vi.fn().mockResolvedValue("result-text"),
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never;
}

const CTX = { companyId: "co1", userId: "u1", conversationId: "conv1" };

describe("executeMcpToolWith", () => {
  it("dispatches a namespaced tool and audits success with mcpConnectionId", async () => {
    const d = deps();
    const out = await executeMcpToolWith("mcp__stripe__list_invoices", { status: "open" }, CTX, d);
    expect(out).toBe("result-text");
    expect((d as never as { callTool: ReturnType<typeof vi.fn> }).callTool)
      .toHaveBeenCalledWith(expect.objectContaining({ slug: "stripe" }), { token: "t" }, "list_invoices", { status: "open" });
    expect((d as never as { audit: ReturnType<typeof vi.fn> }).audit)
      .toHaveBeenCalledWith(expect.objectContaining({ status: "success", mcpConnectionId: "c1", toolName: "mcp__stripe__list_invoices" }));
  });

  it("search_tools meta-tool filters the cached list locally (no live call)", async () => {
    const d = deps();
    const out = await executeMcpToolWith("mcp__stripe__search_tools", { query: "invoice" }, CTX, d);
    expect(out).toContain("list_invoices");
    expect(out).not.toContain("send_reminder");
    expect((d as never as { callTool: ReturnType<typeof vi.fn> }).callTool).not.toHaveBeenCalled();
  });

  it("call_tool meta-tool dispatches its target", async () => {
    const d = deps();
    await executeMcpToolWith("mcp__stripe__call_tool", { tool: "send_reminder", arguments: { id: "1" } }, CTX, d);
    expect((d as never as { callTool: ReturnType<typeof vi.fn> }).callTool)
      .toHaveBeenCalledWith(expect.anything(), expect.anything(), "send_reminder", { id: "1" });
  });

  it("unknown connection → clear error, audited as error", async () => {
    const d = deps({ findConnectionBySlug: vi.fn().mockResolvedValue(null) });
    const out = await executeMcpToolWith("mcp__nope__x", {}, CTX, d);
    expect(out).toMatch(/not connected|not found/i);
    expect((d as never as { audit: ReturnType<typeof vi.fn> }).audit)
      .toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("server failure is caught, audited, and returned as an error string (never throws into the loop)", async () => {
    const d = deps({ callTool: vi.fn().mockRejectedValue(new Error("MCP exploded")) });
    const out = await executeMcpToolWith("mcp__stripe__list_invoices", {}, CTX, d);
    expect(out).toContain("MCP exploded");
    expect((d as never as { audit: ReturnType<typeof vi.fn> }).audit)
      .toHaveBeenCalledWith(expect.objectContaining({ status: "error", mcpConnectionId: "c1" }));
  });
});
