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

  it("concurrent first-use calls create exactly one client (no leaks)", async () => {
    const client = fakeClient();
    const factory = vi.fn().mockResolvedValue(client);
    const mgr = new McpConnectionManager(factory);
    // Fire two getTools simultaneously before either resolves
    const [tools1, tools2] = await Promise.all([
      mgr.getTools(SPEC, null),
      mgr.getTools(SPEC, null),
    ]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(tools1).toBe(tools2);
  });

  it("closes the client and cleans up if listTools throws", async () => {
    const client = fakeClient({ listTools: vi.fn().mockRejectedValue(new Error("list-fail")) });
    const factory = vi.fn().mockResolvedValue(client);
    const mgr = new McpConnectionManager(factory);
    await expect(mgr.getTools(SPEC, null)).rejects.toThrow("list-fail");
    expect(client.close).toHaveBeenCalled();
    // A subsequent call must retry (not return cached rejected promise)
    const client2 = fakeClient();
    factory.mockResolvedValue(client2);
    const tools = await mgr.getTools(SPEC, null);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(tools).toHaveLength(1);
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

  it("paginates listTools across multiple cursor pages", async () => {
    // Simulates a server that returns two pages of tools
    const pagedClient = fakeClient({
      listTools: vi.fn()
        .mockResolvedValueOnce({ tools: [{ name: "tool1", inputSchema: {} }], nextCursor: "page2" })
        .mockResolvedValueOnce({ tools: [{ name: "tool2", inputSchema: {} }] }),
    });
    const mgr = new McpConnectionManager(vi.fn().mockResolvedValue(pagedClient));
    const tools = await mgr.getTools(SPEC, null);
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual(["tool1", "tool2"]);
    expect(pagedClient.listTools).toHaveBeenCalledTimes(2);
    // Cursor must be forwarded on page 2; without this guard the test passes even
    // if listAllTools ignores the cursor and requests page 1 twice.
    expect(pagedClient.listTools).toHaveBeenNthCalledWith(2, { cursor: "page2" });
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
  it("JSON-stringifies non-content results; substitutes placeholder for non-text blocks", () => {
    expect(contentToString({ ok: 1 })).toBe('{"ok":1}');
    // Non-text blocks (image, resource, etc.) are replaced with a safe placeholder to
    // prevent megabytes of base64 data from being injected into the chat-loop string.
    expect(contentToString({ content: [{ type: "image", data: "…" }] })).toBe("[image content omitted]");
    expect(contentToString({ content: [{ type: "resource", uri: "x" }] })).toBe("[resource content omitted]");
  });
});
