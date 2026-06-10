/**
 * MCP tools in the chat loop (spec §3.4, D5/D6/D11).
 * Assembly reads CACHED capabilities (no live MCP round-trips per turn).
 * Dispatch (Task 13) does the live call.
 */
import {
  classifyMcpTool,
  mcpToolName,
  toToolDefinition,
  type BridgedToolDefinition,
  type McpToolInfo,
} from "@burnless/mcp";
import {
  listVisibleConnections,
  listMcpToolPrefs,
  getDisabledMcpConnectionIds,
} from "@burnless/db";
import { getAiFlags } from "@/lib/ai-feature-flags";

export type McpPermCategory = "read" | "write" | "delete";

/** Above this many enabled tools, a connection is deferred behind meta-tools (D6). */
export const DEFER_THRESHOLD = 15;

export interface AssembledMcpTools {
  tools: BridgedToolDefinition[];
  categories: Record<string, McpPermCategory>;
}

interface ConnData {
  id: string;
  slug: string;
  status: string;
  tools: McpToolInfo[];
  prefs: Array<{ toolName: string; enabled: boolean; permClassOverride: McpPermCategory | null }>;
}

/** Pure core — unit-tested directly. */
export function assembleMcpToolsFromData(connections: ConnData[], disabledIds: string[]): AssembledMcpTools {
  const disabled = new Set(disabledIds);
  const tools: BridgedToolDefinition[] = [];
  const categories: Record<string, McpPermCategory> = {};

  for (const conn of connections) {
    if (conn.status !== "connected") continue;
    if (disabled.has(conn.id)) continue; // D11: contributes nothing — not even stubs

    const prefs = new Map(conn.prefs.map((p) => [p.toolName, p]));
    const enabled = conn.tools.filter((t) => prefs.get(t.name)?.enabled !== false);

    if (enabled.length > DEFER_THRESHOLD) {
      // D6 defer: two meta-tools instead of N schemas.
      const search = `mcp__${conn.slug}__search_tools` as const;
      const call = `mcp__${conn.slug}__call_tool` as const;
      tools.push(
        {
          name: search,
          description: `[${conn.slug} MCP] Search this server's ${enabled.length} tools by keyword. Returns matching tool names, descriptions, and input schemas. Use before ${call}.`,
          inputSchema: { type: "object", properties: { query: { type: "string", description: "keyword(s) to match against tool names/descriptions" } }, required: ["query"] },
        },
        {
          name: call,
          description: `[${conn.slug} MCP] Invoke one of this server's tools by name with arguments matching its schema (discover via mcp__${conn.slug}__search_tools).`,
          inputSchema: {
            type: "object",
            properties: {
              tool: { type: "string", description: "exact tool name from search_tools" },
              arguments: { type: "object", description: "arguments matching the tool's inputSchema" },
            },
            required: ["tool"],
          },
        }
      );
      categories[search] = "read";
      categories[call] = "write"; // conservative: meta-dispatch always confirms (refine later)
      continue;
    }

    for (const t of enabled) {
      tools.push(toToolDefinition(conn.slug, t));
      categories[mcpToolName(conn.slug, t.name)] = prefs.get(t.name)?.permClassOverride ?? classifyMcpTool(t);
    }
  }
  return { tools, categories };
}

/** DB-backed entry point used by the chat route. */
export async function assembleMcpTools(companyId: string, userId: string): Promise<AssembledMcpTools> {
  const flags = await getAiFlags(companyId);
  if (!flags?.masterEnabled) return { tools: [], categories: {} };
  const features = (flags.features ?? {}) as unknown as Record<string, boolean>;
  if (features.mcp === false) return { tools: [], categories: {} }; // default-on

  const rows = await listVisibleConnections(companyId, userId);
  if (rows.length === 0) return { tools: [], categories: {} };

  const disabledIds = await getDisabledMcpConnectionIds(userId, companyId);
  const data: ConnData[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      slug: row.slug,
      status: row.status,
      tools: row.capabilities?.tools ?? [],
      prefs: (await listMcpToolPrefs(row.id)).map((p) => ({
        toolName: p.toolName,
        enabled: p.enabled,
        permClassOverride: p.permClassOverride,
      })),
    }))
  );
  return assembleMcpToolsFromData(data, disabledIds);
}
