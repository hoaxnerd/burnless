/**
 * MCP tools in the chat loop (spec §3.4, D5/D6/D11).
 * Assembly reads CACHED capabilities (no live MCP round-trips per turn).
 * Dispatch (Task 13) does the live call.
 */
import {
  classifyMcpTool,
  mcpToolName,
  parseMcpToolName,
  toToolDefinition,
  getMcpConnectionManager,
  type BridgedToolDefinition,
  type McpToolInfo,
  type McpSecret,
  type McpConnectionSpec,
} from "@burnless/mcp";
import {
  listVisibleConnections,
  listMcpToolPrefs,
  getDisabledMcpConnectionIds,
  getDecryptedMcpSecret,
  aiToolAuditLogs,
  db,
} from "@burnless/db";
import { getAiFlags } from "@/lib/ai-feature-flags";
import type { ToolContext } from "./types";

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

// Confirm-card describer lives in ./mcp-describe (no heavy deps); re-exported
// here so MCP consumers have one import surface.
export { describeMcpToolAction } from "./mcp-describe";

/** The slice of getAiFlags this module gates on. */
export interface McpGateFlags {
  masterEnabled: boolean;
  features: unknown;
}

/** DB-backed entry point used by the chat route.
 *  Pass `prefetchedFlags` (the route's own getAiFlags result) to skip the
 *  internal aiFeatureFlags round-trip — the row is already fetched per turn. */
export async function assembleMcpTools(
  companyId: string,
  userId: string,
  prefetchedFlags?: McpGateFlags
): Promise<AssembledMcpTools> {
  const flags = prefetchedFlags ?? (await getAiFlags(companyId));
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

// ── Dispatch (Task 13) ───────────────────────────────────────────────────────

export interface McpDispatchDeps {
  findConnectionBySlug(slug: string, companyId: string, userId: string): Promise<
    | (McpConnectionSpec & { status: string; capabilities?: { tools?: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }> } | null })
    | null
  >;
  getSecret(connectionId: string): Promise<McpSecret | null>;
  callTool(spec: McpConnectionSpec, secret: McpSecret | null, tool: string, args: Record<string, unknown>): Promise<string>;
  audit(entry: {
    companyId: string; userId: string; conversationId: string | null;
    mcpConnectionId: string | null; toolName: string; input: Record<string, unknown>;
    status: "success" | "error"; result: unknown; durationMs: number;
  }): Promise<void>;
}

/** Pure-ish core with injected deps — unit-tested directly. */
export async function executeMcpToolWith(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext & { companyId: string },
  deps: McpDispatchDeps
): Promise<string> {
  const started = Date.now();
  const parsed = parseMcpToolName(toolName);
  const fail = async (connectionId: string | null, message: string) => {
    await deps.audit({
      companyId: context.companyId, userId: context.userId,
      conversationId: context.conversationId ?? null,
      mcpConnectionId: connectionId, toolName, input,
      status: "error", result: { error: message }, durationMs: Date.now() - started,
    });
    return `Error: ${message}`;
  };

  if (!parsed) return fail(null, `Malformed MCP tool name: ${toolName}`);

  const conn = await deps.findConnectionBySlug(parsed.slug, context.companyId, context.userId);
  if (!conn || conn.status !== "connected") {
    return fail(null, `MCP connection "${parsed.slug}" is not connected or not found`);
  }

  // D6 meta-tools.
  if (parsed.tool === "search_tools") {
    const query = String(input.query ?? "").toLowerCase();
    const matches = (conn.capabilities?.tools ?? []).filter(
      (t) => t.name.toLowerCase().includes(query) || (t.description ?? "").toLowerCase().includes(query)
    );
    const result = JSON.stringify(matches.slice(0, 20), null, 2);
    await deps.audit({
      companyId: context.companyId, userId: context.userId,
      conversationId: context.conversationId ?? null,
      mcpConnectionId: conn.id, toolName, input,
      status: "success", result: { matched: matches.length }, durationMs: Date.now() - started,
    });
    return matches.length ? result : `No tools matching "${input.query}". Try a broader keyword.`;
  }

  const targetTool = parsed.tool === "call_tool" ? String(input.tool ?? "") : parsed.tool;
  const targetArgs = parsed.tool === "call_tool"
    ? ((input.arguments ?? {}) as Record<string, unknown>)
    : input;
  if (!targetTool) return fail(conn.id, "call_tool requires a 'tool' argument");

  try {
    const secret = await deps.getSecret(conn.id);
    const result = await deps.callTool(conn, secret, targetTool, targetArgs);
    await deps.audit({
      companyId: context.companyId, userId: context.userId,
      conversationId: context.conversationId ?? null,
      mcpConnectionId: conn.id, toolName, input,
      status: "success", result: { length: result.length }, durationMs: Date.now() - started,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(conn.id, `MCP tool failed: ${message}`);
  }
}

/** Production deps. */
const realDeps: McpDispatchDeps = {
  async findConnectionBySlug(slug, companyId, userId) {
    const rows = await listVisibleConnections(companyId, userId);
    const row = rows.find((r) => r.slug === slug);
    if (!row) return null;
    return {
      id: row.id, slug: row.slug, transport: row.transport, endpoint: row.endpoint,
      args: row.args, env: row.env, authType: row.authType,
      status: row.status, capabilities: row.capabilities,
    };
  },
  getSecret: (connectionId) => getDecryptedMcpSecret(connectionId),
  callTool: (spec, secret, tool, args) => getMcpConnectionManager().callTool(spec, secret, tool, args),
  async audit(entry) {
    // Mirrors logToolAudit in index.ts (fire-and-forget there; awaited here for determinism).
    await db.insert(aiToolAuditLogs).values({
      companyId: entry.companyId,
      userId: entry.userId,
      conversationId: entry.conversationId,
      mcpConnectionId: entry.mcpConnectionId,
      toolName: entry.toolName,
      input: entry.input,
      status: entry.status,
      result: entry.result,
      durationMs: entry.durationMs,
    });
  },
};

export function executeMcpTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext & { companyId: string }
): Promise<string> {
  return executeMcpToolWith(toolName, input, context, realDeps);
}
