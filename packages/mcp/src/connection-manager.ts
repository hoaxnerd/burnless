/**
 * In-process MCP connection manager (spec §3.1, D9). Singleton via globalThis
 * (HMR-safe, mirrors packages/db client). Remote HTTP clients are lightweight;
 * stdio child processes live as long as their cache entry (self-host only —
 * the deploy gate rejects stdio creation in cloud BEFORE rows exist).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpConnectionSpec, McpSecret, McpToolInfo } from "./types";

export interface McpClientLike {
  listTools(params?: { cursor?: string }): Promise<{ tools: McpToolInfo[]; nextCursor?: string }>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

export type ClientFactory = (spec: McpConnectionSpec, secret: McpSecret | null) => Promise<McpClientLike>;

function bearerOf(secret: McpSecret | null): string | null {
  if (!secret) return null;
  if ("token" in secret) return secret.token;
  if ("accessToken" in secret) return secret.accessToken;
  return null;
}

/** Collect all tool pages from a client (MCP tool lists are paginated via nextCursor). */
async function listAllTools(client: McpClientLike): Promise<McpToolInfo[]> {
  const tools: McpToolInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

/** Real SDK factory — only exercised by integration/e2e, unit tests inject fakes. */
export const defaultClientFactory: ClientFactory = async (spec, secret) => {
  const sdkClient = new Client({ name: "burnless", version: "0.1.0" });
  if (spec.transport === "streamable_http") {
    const headers: Record<string, string> = {};
    const bearer = bearerOf(secret);
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    const transport = new StreamableHTTPClientTransport(new URL(spec.endpoint), {
      requestInit: { headers },
    });
    await sdkClient.connect(transport);
  } else {
    const transport = new StdioClientTransport({
      command: spec.endpoint,
      args: spec.args ?? [],
      env: spec.env ?? undefined,
    });
    await sdkClient.connect(transport);
  }
  // Use a thin adapter to keep structural type safety if SDK signatures change.
  const adapter: McpClientLike = {
    listTools: (params) => sdkClient.listTools(params ?? {}),
    callTool: (params) => sdkClient.callTool(params),
    close: () => sdkClient.close(),
  };
  return adapter;
};

/** Flatten an MCP CallToolResult to the string the chat loop expects. */
export function contentToString(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  if (r && Array.isArray(r.content)) {
    const text = r.content
      .map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : JSON.stringify(c)))
      .join("\n");
    return r.isError ? `Error from MCP tool: ${text}` : text;
  }
  return JSON.stringify(result);
}

interface Entry {
  client: McpClientLike;
  tools: McpToolInfo[];
  // NOTE: connectedAt intentionally omitted (YAGNI — no TTL/eviction policy yet).
}

export class McpConnectionManager {
  /**
   * Stores in-flight promises rather than resolved entries so that concurrent
   * first-use calls for the same spec.id share a single creation attempt.
   * On rejection the promise is deleted so the next caller retries cleanly.
   */
  private inflight = new Map<string, Promise<Entry>>();
  constructor(private factory: ClientFactory = defaultClientFactory) {}

  private ensure(spec: McpConnectionSpec, secret: McpSecret | null): Promise<Entry> {
    const cached = this.inflight.get(spec.id);
    if (cached) return cached;

    const promise = (async () => {
      const client = await this.factory(spec, secret);
      try {
        // Paginate through all tool pages — MCP lists can span multiple cursors.
        const tools = await listAllTools(client);
        const entry: Entry = { client, tools };
        return entry;
      } catch (err) {
        // listTools failed after the transport connected — close to prevent a
        // leak (dangling SSE session or orphaned child process).
        try { await client.close(); } catch { /* best-effort */ }
        throw err;
      }
    })();

    // Remove on rejection so a future caller retries rather than receiving a
    // cached rejected promise.
    promise.catch(() => {
      this.inflight.delete(spec.id);
    });

    this.inflight.set(spec.id, promise);
    return promise;
  }

  /**
   * Returns the tool list captured at connect time.
   *
   * Freshness contract: the list is NOT re-fetched on each call — it reflects
   * the server's tool set at the moment this connection was first established.
   * If the server's tools have changed, call `invalidate(spec.id)` first so
   * the next `getTools` reconnects and fetches a fresh list.
   *
   * Secret-refresh note: after an OAuth token rotation, call `invalidate(spec.id)`
   * proactively so the new token is picked up immediately rather than waiting
   * for the first call error to self-heal.
   */
  async getTools(spec: McpConnectionSpec, secret: McpSecret | null): Promise<McpToolInfo[]> {
    return (await this.ensure(spec, secret)).tools;
  }

  async callTool(
    spec: McpConnectionSpec,
    secret: McpSecret | null,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const entry = await this.ensure(spec, secret);
    try {
      const result = await entry.client.callTool({ name: toolName, arguments: args });
      return contentToString(result);
    } catch (err) {
      // Connection may be stale (server restarted, token expired) — drop it so
      // the next attempt reconnects fresh.
      await this.invalidate(spec.id);
      throw err;
    }
  }

  async invalidate(connectionId: string): Promise<void> {
    const promise = this.inflight.get(connectionId);
    if (!promise) return;
    this.inflight.delete(connectionId);
    try {
      const entry = await promise;
      await entry.client.close();
    } catch {
      // Either already failed (no client to close) or close itself failed — both fine.
    }
  }
}

const globalForMcp = globalThis as unknown as { __burnless_mcp_manager?: McpConnectionManager };

export function getMcpConnectionManager(): McpConnectionManager {
  if (!globalForMcp.__burnless_mcp_manager) {
    globalForMcp.__burnless_mcp_manager = new McpConnectionManager();
  }
  return globalForMcp.__burnless_mcp_manager;
}
