import { describe, it, expect } from "vitest";
import { classifyMcpTool, mcpToolName, parseMcpToolName, toToolDefinition } from "../tool-bridge";

describe("classifyMcpTool (D5 safe-by-default)", () => {
  it("readOnlyHint → read", () => {
    expect(classifyMcpTool({ name: "t", inputSchema: {}, annotations: { readOnlyHint: true } })).toBe("read");
  });
  it("destructiveHint → delete (wins over readOnly=false)", () => {
    expect(classifyMcpTool({ name: "t", inputSchema: {}, annotations: { destructiveHint: true, readOnlyHint: false } })).toBe("delete");
  });
  it("no annotations / unknown intent → write", () => {
    expect(classifyMcpTool({ name: "t", inputSchema: {} })).toBe("write");
    expect(classifyMcpTool({ name: "t", inputSchema: {}, annotations: {} })).toBe("write");
  });
});

describe("namespacing", () => {
  it("builds and parses mcp__<slug>__<tool>", () => {
    expect(mcpToolName("stripe", "list_invoices")).toBe("mcp__stripe__list_invoices");
    expect(parseMcpToolName("mcp__stripe__list_invoices")).toEqual({ slug: "stripe", tool: "list_invoices" });
    expect(parseMcpToolName("mcp__my-conn__tool__with__underscores")).toEqual({ slug: "my-conn", tool: "tool__with__underscores" });
  });
  it("returns null for non-MCP names", () => {
    expect(parseMcpToolName("create_scenario")).toBeNull();
    expect(parseMcpToolName("mcp__only-slug")).toBeNull();
  });
});

describe("toToolDefinition", () => {
  it("namespaces, prefixes the description with the connection, passes the schema through", () => {
    const def = toToolDefinition("stripe", {
      name: "list_invoices",
      description: "List invoices",
      inputSchema: { type: "object", properties: { status: { type: "string" } }, required: ["status"] },
    });
    expect(def).toEqual({
      name: "mcp__stripe__list_invoices",
      description: "[stripe MCP] List invoices",
      inputSchema: { type: "object", properties: { status: { type: "string" } }, required: ["status"] },
    });
  });
  it("defaults a missing/empty schema to an empty object schema", () => {
    const def = toToolDefinition("x", { name: "t", inputSchema: {} });
    expect(def.inputSchema).toEqual({ type: "object", properties: {} });
  });
});
