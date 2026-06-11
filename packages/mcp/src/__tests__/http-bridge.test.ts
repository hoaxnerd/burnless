/**
 * HTTP bridge + burnless-server protocol behavior (spec §4.1/§4.2, B7):
 * initialize mints a session (Mcp-Session-Id header), tools/list + tools/call
 * roundtrip JSON-RPC over POST, notifications → 202, missing header → 400,
 * unknown/foreign session → 404, GET → 405, DELETE terminates, batch → 400,
 * executor throw → isError tool result, per-request scope refresh.
 */
import { describe, it, expect, vi } from "vitest";
import { createBurnlessMcpServer } from "../server/burnless-server";
import { McpSessionManager, type McpSessionState, type McpClientInfo } from "../server/session-manager";
import { handleMcpHttpRequest, type McpHttpDeps } from "../server/http-bridge";

const TOOLS = [
  {
    name: "get_metrics",
    description: "Get metrics",
    inputSchema: { type: "object", properties: {}, required: [] } as Record<string, unknown>,
  },
];
const RESOURCES = [
  {
    uri: "burnless://reports/metrics",
    name: "Key metrics",
    description: "Metrics report",
    mimeType: "application/json",
  },
];

function makeDeps(overrides?: {
  credentialKey?: string;
  scopes?: string[];
  executeTool?: (name: string, input: Record<string, unknown>) => Promise<string>;
}) {
  const sessions = new McpSessionManager();
  const executeTool =
    overrides?.executeTool ??
    (async (name: string) => JSON.stringify({ ok: true, tool: name }));
  const seenStates: McpSessionState[] = [];
  const deps: McpHttpDeps = {
    sessions,
    credentialKey: overrides?.credentialKey ?? "pat:tok-1",
    scopes: overrides?.scopes ?? ["read", "write"],
    buildServer: (state: McpSessionState, _clientInfo: McpClientInfo | null) => {
      seenStates.push(state);
      return createBurnlessMcpServer({
        tools: TOOLS,
        resources: RESOURCES,
        executeTool,
        readResource: async (uri: string) => JSON.stringify({ uri, data: [] }),
      });
    },
  };
  return { deps, sessions, seenStates };
}

function post(body: unknown, sessionId?: string): Request {
  return new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  },
};

async function initSession(deps: McpHttpDeps): Promise<string> {
  const res = await handleMcpHttpRequest(post(INIT), deps);
  expect(res.status).toBe(200);
  const sessionId = res.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  return sessionId!;
}

describe("handleMcpHttpRequest", () => {
  it("initialize → 200 + Mcp-Session-Id + serverInfo result", async () => {
    const { deps } = makeDeps();
    const res = await handleMcpHttpRequest(post(INIT), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.result.serverInfo.name).toBe("burnless");
    expect(res.headers.get("mcp-session-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("tools/list returns the injected tools", async () => {
    const { deps } = makeDeps();
    const sessionId = await initSession(deps);
    const res = await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId),
      deps
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0].name).toBe("get_metrics");
  });

  it("tools/call dispatches to executeTool and wraps as text content", async () => {
    const executeTool = vi.fn(async () => JSON.stringify({ runway: 12 }));
    const { deps } = makeDeps({ executeTool });
    const sessionId = await initSession(deps);
    const res = await handleMcpHttpRequest(
      post(
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_metrics", arguments: {} } },
        sessionId
      ),
      deps
    );
    const body = await res.json();
    expect(executeTool).toHaveBeenCalledWith("get_metrics", {});
    expect(body.result.content).toEqual([{ type: "text", text: JSON.stringify({ runway: 12 }) }]);
    expect(body.result.isError).toBeUndefined();
  });

  it("executeTool throw → isError tool result, not a protocol error", async () => {
    const { deps } = makeDeps({
      executeTool: async () => {
        throw new Error("compute blew up");
      },
    });
    const sessionId = await initSession(deps);
    const res = await handleMcpHttpRequest(
      post(
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_metrics", arguments: {} } },
        sessionId
      ),
      deps
    );
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("compute blew up");
  });

  it("resources/list + resources/read roundtrip", async () => {
    const { deps } = makeDeps();
    const sessionId = await initSession(deps);
    const list = await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", id: 5, method: "resources/list", params: {} }, sessionId),
      deps
    );
    expect((await list.json()).result.resources[0].uri).toBe("burnless://reports/metrics");
    const read = await handleMcpHttpRequest(
      post(
        { jsonrpc: "2.0", id: 6, method: "resources/read", params: { uri: "burnless://reports/metrics" } },
        sessionId
      ),
      deps
    );
    const body = await read.json();
    expect(body.result.contents[0].mimeType).toBe("application/json");
    expect(JSON.parse(body.result.contents[0].text).uri).toBe("burnless://reports/metrics");
  });

  it("notification (no id) → 202 empty body", async () => {
    const { deps } = makeDeps();
    const sessionId = await initSession(deps);
    const res = await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId),
      deps
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("non-initialize POST without Mcp-Session-Id → 400 JSON-RPC error", async () => {
    const { deps } = makeDeps();
    const res = await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", id: 9, method: "tools/list", params: {} }),
      deps
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("Mcp-Session-Id");
  });

  it("unknown session id → 404 JSON-RPC error (spec MUST)", async () => {
    const { deps } = makeDeps();
    const res = await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", id: 10, method: "tools/list", params: {} }, "00000000-0000-4000-a000-00000000beef"),
      deps
    );
    expect(res.status).toBe(404);
  });

  it("a session replayed with a different credential → 404 (hijack guard)", async () => {
    const { deps, sessions } = makeDeps({ credentialKey: "pat:tok-1" });
    const sessionId = await initSession(deps);
    const foreign: McpHttpDeps = { ...deps, sessions, credentialKey: "pat:tok-EVIL" };
    const res = await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {} }, sessionId),
      foreign
    );
    expect(res.status).toBe(404);
  });

  it("scopes are refreshed on every request (re-cap per call, spec §4.3.2)", async () => {
    const { deps, seenStates } = makeDeps({ scopes: ["read", "write"] });
    const sessionId = await initSession(deps);
    expect(seenStates[0]!.scopes).toEqual(["read", "write"]);
    const demoted: McpHttpDeps = { ...deps, scopes: ["read"] };
    await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", id: 12, method: "tools/list", params: {} }, sessionId),
      demoted
    );
    expect(seenStates[0]!.scopes).toEqual(["read"]);
  });

  it("GET → 405; unsupported method → 405", async () => {
    const { deps } = makeDeps();
    const get = await handleMcpHttpRequest(
      new Request("http://localhost:3000/mcp", { method: "GET" }),
      deps
    );
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST, DELETE");
  });

  it("DELETE terminates the session; the id is then 404 (spec MUST)", async () => {
    const { deps } = makeDeps();
    const sessionId = await initSession(deps);
    const del = await handleMcpHttpRequest(
      new Request("http://localhost:3000/mcp", {
        method: "DELETE",
        headers: { "mcp-session-id": sessionId },
      }),
      deps
    );
    expect(del.status).toBe(204);
    const reuse = await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", id: 13, method: "tools/list", params: {} }, sessionId),
      deps
    );
    expect(reuse.status).toBe(404);
  });

  it("malformed JSON → 400 parse error; batch arrays → 400", async () => {
    const { deps } = makeDeps();
    const bad = await handleMcpHttpRequest(
      new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
      deps
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe(-32700);
    const batch = await handleMcpHttpRequest(post([INIT]), deps);
    expect(batch.status).toBe(400);
    expect((await batch.json()).error.code).toBe(-32600);
  });
});
