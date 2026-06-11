/**
 * `burnless serve` (spec §7.4, decision C2): a stdio MCP server proxying the
 * active profile's remote Burnless instance — SDK low-level Server and the
 * remote Client back-to-back. Schemas and results pass through untouched so
 * stdio-only agents see the exact remote surface. clientInfo on the remote leg
 * is "burnless-cli" (spec §4.3 audit attribution).
 */
import type { Command } from "commander";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { openSessionFor, runAction } from "../context";
import type { McpSession } from "../mcp-session";
import { CLI_VERSION } from "../version";

export type ProxyRemote = Pick<
  McpSession,
  "listToolsRaw" | "callToolRaw" | "listResourcesRaw" | "readResourceRaw"
>;

export function createProxyServer(remote: ProxyRemote): Server {
  const server = new Server(
    { name: "burnless-cli", version: CLI_VERSION },
    { capabilities: { tools: {}, resources: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => remote.listToolsRaw());
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    remote.callToolRaw(request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>)
  );
  server.setRequestHandler(ListResourcesRequestSchema, async () => remote.listResourcesRaw());
  server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
    remote.readResourceRaw(request.params.uri)
  );
  return server;
}

export function registerServe(program: Command): void {
  program
    .command("serve")
    .description("Run a stdio MCP server proxying the active profile's instance (for stdio-only agents)")
    .action(async (_opts: Record<string, never>, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        const session = await openSessionFor(ctx);
        const server = createProxyServer(session);
        const transport = new StdioServerTransport();
        // stdout carries the MCP protocol — human logs go to stderr only.
        process.stderr.write(
          `burnless serve: proxying ${ctx.profile.baseUrl} over stdio (profile "${ctx.profileName}")\n`
        );
        await server.connect(transport);
        await new Promise<void>((resolve) => {
          server.onclose = () => resolve();
          process.stdin.on("close", () => resolve());
        });
        await session.close();
      });
    });
}
