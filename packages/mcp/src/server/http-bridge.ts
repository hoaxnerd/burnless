/**
 * Web Request/Response ↔ SDK bridge (expose spec §4.1, B7). We do NOT use
 * StreamableHTTPServerTransport (it needs Node req/res; Next.js route
 * handlers hand us Web Requests). Instead, each session gets an
 * InMemoryTransport linked pair: the server side is connected to the SDK
 * Server; the bridge sends the POSTed JSON-RPC message on the client side
 * and awaits the correlated response (matched by id). JSON-response mode
 * only — no SSE streams; server-initiated messages are dropped.
 */
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
  McpClientInfo,
  McpSessionManager,
  McpSessionState,
} from "./session-manager";

const RESPONSE_TIMEOUT_MS = 30_000;

/** One SDK Server wired to an in-memory pair, driven message-by-message. */
export class BridgedServer {
  private pending = new Map<string | number, (msg: JSONRPCMessage) => void>();

  private constructor(
    private clientSide: InMemoryTransport,
    private server: Server
  ) {}

  static async create(server: Server): Promise<BridgedServer> {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const bridge = new BridgedServer(clientSide, server);
    // onmessage MUST be set before connect so responses are never queued.
    clientSide.onmessage = (message) => bridge.dispatch(message);
    await server.connect(serverSide); // Protocol.connect() starts serverSide
    await clientSide.start(); // flush anything queued (normally a no-op)
    return bridge;
  }

  private dispatch(message: JSONRPCMessage): void {
    const m = message as { id?: string | number; result?: unknown; error?: unknown };
    if (m.id !== undefined && ("result" in m || "error" in m)) {
      const resolve = this.pending.get(m.id);
      if (resolve) {
        this.pending.delete(m.id);
        resolve(message);
      }
    }
    // Server-initiated requests/notifications: dropped — JSON-response mode
    // has no stream to deliver them on (spec §4.1: GET stream = 405).
  }

  /** Send one client→server message. Requests resolve with the correlated
   *  response; notifications (no id) resolve null immediately. */
  async request(
    message: JSONRPCMessage,
    timeoutMs: number = RESPONSE_TIMEOUT_MS
  ): Promise<JSONRPCMessage | null> {
    const m = message as { id?: string | number };
    if (m.id === undefined) {
      await this.clientSide.send(message);
      return null;
    }
    const id = m.id;
    return new Promise<JSONRPCMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP response timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
      void this.clientSide.send(message).catch((err) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  async close(): Promise<void> {
    await this.server.close(); // closes both sides of the linked pair
  }
}

export interface McpHttpDeps {
  sessions: McpSessionManager;
  /** Stable identity of the presented credential, e.g. "pat:<tokenId>" or
   *  "oauth:<grantId>". Sessions are bound to it (spec §4.3 step 4). */
  credentialKey: string;
  /** Effective scopes for THIS request — written into session state on every
   *  call so role demotion bites immediately (spec §4.3 step 2). */
  scopes: string[];
  /** Build a fresh Server for a new session. The closure should capture
   *  `state` (session-scoped scenarioId + scopes) and `clientInfo`. */
  buildServer: (
    state: McpSessionState,
    clientInfo: McpClientInfo | null
  ) => Server | Promise<Server>;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function rpcError(status: number, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: null, error: { code, message } }),
    { status, headers: JSON_HEADERS }
  );
}

/**
 * The whole Streamable-HTTP surface we implement (spec §4.1):
 * POST = JSON-RPC (JSON-response mode), DELETE = session termination,
 * GET = 405 (no server stream in v1).
 */
export async function handleMcpHttpRequest(
  request: Request,
  deps: McpHttpDeps
): Promise<Response> {
  if (request.method === "DELETE") {
    const sessionId = request.headers.get("mcp-session-id");
    if (!sessionId) return rpcError(400, -32000, "Missing Mcp-Session-Id header");
    const session = deps.sessions.get(sessionId, deps.credentialKey);
    if (!session) return rpcError(404, -32001, "Session not found");
    await deps.sessions.terminate(sessionId);
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST, DELETE" } });
  }

  let message: JSONRPCMessage;
  try {
    message = (await request.json()) as JSONRPCMessage;
  } catch {
    return rpcError(400, -32700, "Parse error: body is not valid JSON");
  }
  if (Array.isArray(message)) {
    return rpcError(400, -32600, "JSON-RPC batching is not supported");
  }

  try {
    if (isInitializeRequest(message)) {
      const clientInfo =
        ((message as { params?: { clientInfo?: McpClientInfo } }).params
          ?.clientInfo ?? null);
      const state: McpSessionState = { scenarioId: null, scopes: deps.scopes };
      const server = await deps.buildServer(state, clientInfo);
      const bridge = await BridgedServer.create(server);
      const session = deps.sessions.create({
        bridge,
        state,
        credentialKey: deps.credentialKey,
        clientInfo,
      });
      const response = await bridge.request(message);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...JSON_HEADERS, "Mcp-Session-Id": session.id },
      });
    }

    const sessionId = request.headers.get("mcp-session-id");
    if (!sessionId) return rpcError(400, -32000, "Missing Mcp-Session-Id header");
    const session = deps.sessions.get(sessionId, deps.credentialKey);
    if (!session) return rpcError(404, -32001, "Session not found");
    session.state.scopes = deps.scopes; // re-cap on every call

    const response = await session.bridge.request(message);
    if (response === null) return new Response(null, { status: 202 }); // notification
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...JSON_HEADERS, "Mcp-Session-Id": session.id },
    });
  } catch (err) {
    return rpcError(500, -32603, err instanceof Error ? err.message : "Internal error");
  }
}
