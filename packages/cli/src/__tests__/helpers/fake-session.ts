import type { McpSession, McpToolInfo, ToolCallResult } from "../../mcp-session";

export interface FakeSessionLog {
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  resourceReads: string[];
  closed: boolean;
}

export function makeFakeSession(overrides: Partial<McpSession> = {}): {
  session: McpSession;
  log: FakeSessionLog;
} {
  const log: FakeSessionLog = { toolCalls: [], resourceReads: [], closed: false };
  const session: McpSession = {
    async listTools(): Promise<McpToolInfo[]> {
      return [{ name: "get_metrics" }, { name: "list_scenarios" }];
    },
    async callTool(name, input): Promise<ToolCallResult> {
      log.toolCalls.push({ name, input });
      return { isError: false, text: JSON.stringify({ ok: true, tool: name }) };
    },
    async readResource(uri): Promise<string> {
      log.resourceReads.push(uri);
      return JSON.stringify({ uri });
    },
    async listToolsRaw() {
      return { tools: [{ name: "get_metrics", inputSchema: { type: "object" as const } }] };
    },
    async callToolRaw(name, args) {
      log.toolCalls.push({ name, input: args });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
    },
    async listResourcesRaw() {
      return { resources: [{ uri: "burnless://reports/cap-table", name: "cap-table" }] };
    },
    async readResourceRaw(uri) {
      log.resourceReads.push(uri);
      return { contents: [{ uri, text: "{}" }] };
    },
    serverVersion: () => ({ name: "burnless", version: "test" }),
    async close() {
      log.closed = true;
    },
    ...overrides,
  };
  return { session, log };
}
