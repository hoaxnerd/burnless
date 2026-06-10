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
  listTools(): Promise<{ tools: McpToolInfo[] }>;
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

/** Real SDK factory — only exercised by integration/e2e, unit tests inject fakes. */
export const defaultClientFactory: ClientFactory = async (spec, secret) => {
  const client = new Client({ name: "burnless", version: "0.1.0" });
  if (spec.transport === "streamable_http") {
    const headers: Record<string, string> = {};
    const bearer = bearerOf(secret);
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    const transport = new StreamableHTTPClientTransport(new URL(spec.endpoint), {
      requestInit: { headers },
    });
    await client.connect(transport);
  } else {
    const transport = new StdioClientTransport({
      command: spec.endpoint,
      args: spec.args ?? [],
      env: spec.env ?? undefined,
    });
    await client.connect(transport);
  }
  return client as unknown as McpClientLike;
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
  connectedAt: number;
}

export class McpConnectionManager {
  private entries = new Map<string, Entry>();
  constructor(private factory: ClientFactory = defaultClientFactory) {}

  private async ensure(spec: McpConnectionSpec, secret: McpSecret | null): Promise<Entry> {
    const existing = this.entries.get(spec.id);
    if (existing) return existing;
    const client = await this.factory(spec, secret);
    const { tools } = await client.listTools();
    const entry: Entry = { client, tools, connectedAt: Date.now() };
    this.entries.set(spec.id, entry);
    return entry;
  }

  /** Live tool list (also refreshes the entry). Callers persist this into capabilities. */
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
    const entry = this.entries.get(connectionId);
    if (!entry) return;
    this.entries.delete(connectionId);
    try {
      await entry.client.close();
    } catch {
      // best-effort close
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
