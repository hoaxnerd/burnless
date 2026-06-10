/**
 * Paste-config parser (spec D7): accepts the de-facto `.mcp.json` shapes used by
 * Claude Code / openclaw / hermes — either a bare { name: entry } map or a
 * { mcpServers: { ... } } wrapper. Normalizes transport aliases.
 */
import { z } from "zod";
import { McpConfigError } from "./types";

export interface ParsedMcpServer {
  name: string;
  transport: "streamable_http" | "stdio";
  url: string | undefined;
  command: string | undefined;
  args: string[];
  headers: Record<string, string>;
  env: Record<string, string>;
}

const entrySchema = z.object({
  type: z.string().optional(),
  transport: z.string().optional(),
  url: z.string().url().optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).default([]),
  headers: z.record(z.string()).default({}),
  env: z.record(z.string()).default({}),
});

const HTTP_ALIASES = new Set(["http", "streamable-http", "streamable_http"]);

export function parseMcpConfig(json: string): ParsedMcpServer[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new McpConfigError("Invalid JSON — paste the server config exactly as documented");
  }
  if (typeof raw !== "object" || raw === null) throw new McpConfigError("Config must be a JSON object");

  const map = (raw as Record<string, unknown>).mcpServers ?? raw;
  const entries = Object.entries(map as Record<string, unknown>);
  if (entries.length === 0) throw new McpConfigError("Config contains no servers");

  return entries.map(([name, value]) => {
    const parsed = entrySchema.safeParse(value);
    if (!parsed.success) {
      throw new McpConfigError(`Server "${name}": ${parsed.error.issues[0]?.message ?? "invalid entry"}`);
    }
    const e = parsed.data;
    const declared = (e.type ?? e.transport)?.toLowerCase();

    if (declared === "sse") {
      throw new McpConfigError(`Server "${name}": the SSE transport is deprecated — use the server's Streamable HTTP endpoint`);
    }
    if (declared === "ws") {
      throw new McpConfigError(`Server "${name}": WebSocket transport is not supported`);
    }

    const isHttp = declared ? HTTP_ALIASES.has(declared) : Boolean(e.url && !e.command);
    const isStdio = declared === "stdio" || (!declared && Boolean(e.command));

    if (isHttp) {
      if (!e.url) throw new McpConfigError(`Server "${name}": HTTP transport requires a url`);
      return { name, transport: "streamable_http" as const, url: e.url, command: undefined, args: [], headers: e.headers, env: {} };
    }
    if (isStdio) {
      if (!e.command) throw new McpConfigError(`Server "${name}": stdio transport requires a command`);
      return { name, transport: "stdio" as const, url: undefined, command: e.command, args: e.args, headers: {}, env: e.env };
    }
    throw new McpConfigError(`Server "${name}": could not determine transport — provide a url (remote) or command (local)`);
  });
}
