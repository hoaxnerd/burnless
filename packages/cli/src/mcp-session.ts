/**
 * The CLI's single MCP seam (spec §7 / decision C4): an SDK Client over
 * Streamable HTTP with a bearer token. Header injection uses the SDK's
 * `requestInit` transport option (verified against @modelcontextprotocol/sdk
 * 1.29.0 — StreamableHTTPClientTransportOptions.requestInit).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  CallToolResult,
  ListResourcesResult,
  ListToolsResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { CLI_VERSION } from "./version";

export const CLI_CLIENT_INFO = { name: "burnless-cli", version: CLI_VERSION } as const;

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface ToolCallResult {
  isError: boolean;
  text: string;
}

export interface McpSession {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, input: Record<string, unknown>): Promise<ToolCallResult>;
  readResource(uri: string): Promise<string>;
  /** Raw pass-throughs for `burnless serve` (Task 12 proxy). */
  listToolsRaw(): Promise<ListToolsResult>;
  callToolRaw(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
  listResourcesRaw(): Promise<ListResourcesResult>;
  readResourceRaw(uri: string): Promise<ReadResourceResult>;
  serverVersion(): { name: string; version: string } | undefined;
  close(): Promise<void>;
}

export interface OpenSessionOptions {
  baseUrl: string;
  token: string;
}

export type TransportFactory = () => Transport;

/** Canonical MCP endpoint of an instance (spec §4.1: `${APP_URL}/mcp`). */
export function mcpUrlOf(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "") + "/mcp";
}

export async function openSession(
  opts: OpenSessionOptions,
  transportFactory?: TransportFactory
): Promise<McpSession> {
  const client = new Client({ ...CLI_CLIENT_INFO });
  const transport: Transport = transportFactory
    ? transportFactory()
    : new StreamableHTTPClientTransport(new URL(mcpUrlOf(opts.baseUrl)), {
        requestInit: { headers: { Authorization: `Bearer ${opts.token}` } },
      });
  await client.connect(transport);

  return {
    async listTools() {
      const tools: McpToolInfo[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor !== undefined ? { cursor } : undefined);
        tools.push(
          ...page.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
        );
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      return tools;
    },

    async callTool(name, input) {
      const result = (await client.callTool({ name, arguments: input })) as CallToolResult;
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : `[${c.type} content omitted]`))
        .join("\n");
      return { isError: result.isError === true, text };
    },

    async readResource(uri) {
      const result = await client.readResource({ uri });
      const first = result.contents[0];
      if (first !== undefined && "text" in first && typeof first.text === "string") return first.text;
      return JSON.stringify(result.contents);
    },

    listToolsRaw: () => client.listTools(),
    callToolRaw: async (name, args) => (await client.callTool({ name, arguments: args })) as CallToolResult,
    listResourcesRaw: () => client.listResources(),
    readResourceRaw: (uri) => client.readResource({ uri }),

    serverVersion() {
      return client.getServerVersion();
    },

    close: () => client.close(),
  };
}
