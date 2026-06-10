import { describe, it, expect, vi } from "vitest";
import { McpConnectionManager, contentToString, type McpClientLike } from "../connection-manager";
import type { McpConnectionSpec } from "../types";

const SPEC: McpConnectionSpec = {
  id: "c1", slug: "fake", transport: "streamable_http",
  endpoint: "https://fake.example/mcp", authType: "none",
};

function fakeClient(overrides: Partial<McpClientLike> = {}): McpClientLike {
  return {
    listTools: vi.fn().mockResolvedValue({ tools: [{ name: "echo", inputSchema: { type: "object", properties: {} } }] }),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "hi" }] }),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("McpConnectionManager", () => {
  it("creates once, caches, and lists tools", async () => {
    const client = fakeClient();
    const factory = vi.fn().mockResolvedValue(client);
    const mgr = new McpConnectionManager(factory);
    const tools1 = await mgr.getTools(SPEC, null);
    const tools2 = await mgr.getTools(SPEC, null);
    expect(tools1).toHaveLength(1);
    expect(tools2).toBe(tools1);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("calls a tool and stringifies text content", async () => {
    const mgr = new McpConnectionManager(vi.fn().mockResolvedValue(fakeClient()));
    const out = await mgr.callTool(SPEC, null, "echo", { msg: "x" });
    expect(out).toBe("hi");
  });

  it("invalidates the cached entry on call failure and rethrows", async () => {
    const bad = fakeClient({ callTool: vi.fn().mockRejectedValue(new Error("boom")) });
    const factory = vi.fn().mockResolvedValue(bad);
    const mgr = new McpConnectionManager(factory);
    await expect(mgr.callTool(SPEC, null, "echo", {})).rejects.toThrow("boom");
    expect(bad.close).toHaveBeenCalled();
    // next use re-creates
    await mgr.getTools(SPEC, null);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("invalidate() closes and forgets", async () => {
    const client = fakeClient();
    const factory = vi.fn().mockResolvedValue(client);
    const mgr = new McpConnectionManager(factory);
    await mgr.getTools(SPEC, null);
    await mgr.invalidate(SPEC.id);
    expect(client.close).toHaveBeenCalled();
    await mgr.getTools(SPEC, null);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe("contentToString", () => {
  it("joins text blocks; marks isError results", () => {
    expect(contentToString({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] })).toBe("a\nb");
    expect(contentToString({ isError: true, content: [{ type: "text", text: "bad" }] })).toBe("Error from MCP tool: bad");
  });
  it("JSON-stringifies non-content results and non-text blocks", () => {
    expect(contentToString({ ok: 1 })).toBe('{"ok":1}');
    expect(contentToString({ content: [{ type: "image", data: "…" }] })).toContain('"type":"image"');
  });
});
