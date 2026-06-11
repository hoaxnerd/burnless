/**
 * Web-free MCP server factory (expose spec §4.2, B7). Uses the SDK LOW-LEVEL
 * `Server` (not McpServer): our tools already carry JSON Schema, while
 * McpServer wants Zod shapes. Tools/resources/executors are INJECTED — this
 * package never imports db/next/web.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface BurnlessToolDef {
  name: string;
  description: string;
  /** JSON Schema ({ type: "object", properties, required? }). */
  inputSchema: Record<string, unknown>;
}

export interface BurnlessResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface CreateBurnlessMcpServerOptions {
  tools: BurnlessToolDef[];
  resources: BurnlessResourceDef[];
  /** Run one tool call; returns the tool's string payload (usually JSON).
   *  A throw becomes an `isError: true` tool result, not a protocol error. */
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  /** Read one resource by uri; returns a JSON string. A throw becomes a
   *  JSON-RPC error on the read request. */
  readResource: (uri: string) => Promise<string>;
  serverInfo?: { name: string; version: string };
}

export function createBurnlessMcpServer(opts: CreateBurnlessMcpServerOptions): Server {
  const server = new Server(opts.serverInfo ?? { name: "burnless", version: "1.0.0" }, {
    capabilities: { tools: {}, resources: {} },
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object"; [k: string]: unknown },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      const text = await opts.executeTool(name, args);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: opts.resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const text = await opts.readResource(uri);
    return { contents: [{ uri, mimeType: "application/json", text }] };
  });

  return server;
}
