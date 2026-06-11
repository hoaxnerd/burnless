import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";

export interface RecordedCall {
  name: string;
  args: Record<string, unknown>;
}

export interface MockServerHandle {
  clientTransport: Transport;
  calls: RecordedCall[];
}

/** Real SDK McpServer over InMemoryTransport.createLinkedPair() (spec §8 CLI testing). */
export async function startMockServer(): Promise<MockServerHandle> {
  const calls: RecordedCall[] = [];
  const server = new McpServer({ name: "burnless-mock", version: "9.9.9" });

  server.registerTool(
    "get_metrics",
    { description: "mock metrics", inputSchema: { startDate: z.string().optional(), endDate: z.string().optional() } },
    async (input) => {
      calls.push({ name: "get_metrics", args: input as Record<string, unknown> });
      return { content: [{ type: "text", text: JSON.stringify({ mrr: 1200, runwayMonths: 14 }) }] };
    }
  );

  server.registerTool(
    "activate_scenario",
    { description: "mock activate", inputSchema: { scenarioId: z.string() } },
    async (input) => {
      calls.push({ name: "activate_scenario", args: input as Record<string, unknown> });
      return { content: [{ type: "text", text: JSON.stringify({ activated: (input as { scenarioId: string }).scenarioId }) }] };
    }
  );

  server.registerTool(
    "delete_headcount",
    { description: "mock delete", inputSchema: { id: z.string() } },
    async (input) => {
      calls.push({ name: "delete_headcount", args: input as Record<string, unknown> });
      return { content: [{ type: "text", text: JSON.stringify({ deleted: (input as { id: string }).id }) }] };
    }
  );

  server.registerResource(
    "cap-table",
    "burnless://reports/cap-table",
    { description: "mock cap table", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ pool: 0.1 }) }],
    })
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  return { clientTransport, calls };
}
