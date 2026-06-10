/**
 * Bridges MCP tools into the app's tool model (spec §3.1 tool-bridge, D5/D6).
 * Namespace: mcp__<connection-slug>__<tool-name>. Slugs never contain "__"
 * (slugify collapses non-alphanumerics to single "-"), so splitting on the
 * FIRST "__" after the prefix is unambiguous even when tool names contain "__".
 */
import type { McpPermClass, McpToolInfo } from "./types";

/** Matches the web app's ToolDefinition (packages/ai/src/providers/types.ts). */
export interface BridgedToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

/** D5 safe-by-default: explicit read hint → read; destructive → delete; everything else → write. */
export function classifyMcpTool(tool: McpToolInfo): McpPermClass {
  if (tool.annotations?.destructiveHint === true) return "delete";
  if (tool.annotations?.readOnlyHint === true) return "read";
  return "write";
}

export function mcpToolName(slug: string, toolName: string): string {
  return `mcp__${slug}__${toolName}`;
}

export function parseMcpToolName(name: string): { slug: string; tool: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep <= 0 || sep === rest.length - 2) return null;
  return { slug: rest.slice(0, sep), tool: rest.slice(sep + 2) };
}

export function toToolDefinition(slug: string, tool: McpToolInfo): BridgedToolDefinition {
  const schema = tool.inputSchema as { type?: string; properties?: Record<string, unknown>; required?: string[] };
  return {
    name: mcpToolName(slug, tool.name),
    description: `[${slug} MCP] ${tool.description ?? tool.name}`,
    inputSchema:
      schema && schema.type === "object" && schema.properties
        ? { type: "object", properties: schema.properties, ...(schema.required ? { required: schema.required } : {}) }
        : { type: "object", properties: {} },
  };
}
