/**
 * Connection probe: attempt handshake + tool listing, classify the outcome.
 * 401-ish failures mean "reachable but needs OAuth" (spec D8 auto-detect).
 */
import {
  getMcpConnectionManager,
  type McpConnectionManager,
  type McpConnectionSpec,
  type McpSecret,
  type McpToolInfo,
} from "@burnless/mcp";

export interface ProbeResult {
  status: "connected" | "needs_auth" | "error";
  tools: McpToolInfo[];
  error: string | null;
}

// Some servers (e.g. GitHub's MCP) return 400 "missing required Authorization
// header" instead of a proper 401 — treat any missing/required-Authorization
// complaint as "reachable but needs auth" too.
const UNAUTHORIZED_RE = /\b401\b|unauthorized|invalid[_ ]token|authorization header/i;

export async function probeConnection(
  spec: McpConnectionSpec,
  secret: McpSecret | null,
  manager: McpConnectionManager = getMcpConnectionManager()
): Promise<ProbeResult> {
  try {
    const tools = await manager.getTools(spec, secret);
    return { status: "connected", tools, error: null };
  } catch (err) {
    await manager.invalidate(spec.id);
    const message = err instanceof Error ? err.message : String(err);
    if (UNAUTHORIZED_RE.test(message)) {
      return { status: "needs_auth", tools: [], error: null };
    }
    return { status: "error", tools: [], error: message.slice(0, 500) };
  }
}

/** Row → runtime spec (single place that does this mapping). */
export function specFromRow(row: {
  id: string;
  slug: string;
  transport: "streamable_http" | "stdio";
  endpoint: string;
  args: string[] | null;
  env: Record<string, string> | null;
  authType: "oauth" | "pat" | "none";
}): McpConnectionSpec {
  return {
    id: row.id,
    slug: row.slug,
    transport: row.transport,
    endpoint: row.endpoint,
    args: row.args,
    env: row.env,
    authType: row.authType,
  };
}
