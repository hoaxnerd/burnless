import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createProxyServer, type ProxyRemote } from "../commands/serve";

function makeFakeRemote(): { remote: ProxyRemote; calls: Array<{ name: string; args: unknown }> } {
  const calls: Array<{ name: string; args: unknown }> = [];
  const remote: ProxyRemote = {
    async listToolsRaw() {
      return {
        tools: [
          {
            name: "get_metrics",
            description: "remote metrics",
            inputSchema: { type: "object" as const, properties: {} },
          },
        ],
      };
    },
    async callToolRaw(name, args) {
      calls.push({ name, args });
      return { content: [{ type: "text" as const, text: JSON.stringify({ proxied: name }) }] };
    },
    async listResourcesRaw() {
      return { resources: [{ uri: "burnless://reports/cap-table", name: "cap-table" }] };
    },
    async readResourceRaw(uri) {
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ from: uri }) }] };
    },
  };
  return { remote, calls };
}

describe("burnless serve proxy (spec §7.4: SDK server + client back-to-back)", () => {
  it("proxies tools/list, tools/call, resources/list, resources/read pass-through", async () => {
    const { remote, calls } = makeFakeRemote();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createProxyServer(remote);
    await server.connect(serverTransport);

    const client = new Client({ name: "stdio-agent", version: "0.0.1" });
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(["get_metrics"]);
    expect(tools.tools[0]?.description).toBe("remote metrics");

    const result = await client.callTool({ name: "get_metrics", arguments: { startDate: "2026-01" } });
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(JSON.parse(content[0]?.text ?? "")).toEqual({ proxied: "get_metrics" });
    expect(calls).toEqual([{ name: "get_metrics", args: { startDate: "2026-01" } }]);

    const resources = await client.listResources();
    expect(resources.resources[0]?.uri).toBe("burnless://reports/cap-table");

    const read = await client.readResource({ uri: "burnless://reports/cap-table" });
    const first = read.contents[0] as { text?: string };
    expect(JSON.parse(first.text ?? "")).toEqual({ from: "burnless://reports/cap-table" });

    await client.close();
    await server.close();
  });
});
