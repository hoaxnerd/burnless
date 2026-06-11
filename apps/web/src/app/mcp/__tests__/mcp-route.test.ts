/**
 * Keystone integration (spec §8): initialize → tools/list → tools/call over
 * the real /mcp route with a real PAT against PGLite. Only executeToolCall
 * and getAiFlags are mocked.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createUser, createCompany, createMember, createScenario } from "@db-test/factories";
import { getTestDb } from "@db-test/setup";
import { companies, mintApiToken } from "@burnless/db";

const { mockExecuteToolCall, mockGetAiFlags } = vi.hoisted(() => ({
  mockExecuteToolCall: vi.fn(async (name: string) => JSON.stringify({ ok: true, tool: name })),
  mockGetAiFlags: vi.fn(async () => ({ writeMode: "full" })),
}));

vi.mock("@/lib/ai-tools", () => ({ executeToolCall: mockExecuteToolCall }));
vi.mock("@/lib/ai-feature-flags", () => ({ getAiFlags: mockGetAiFlags }));
// Module-load shim only (never invoked here): resources.ts imports
// @/lib/compute-cap-table → data.ts → ./auth → next-auth, whose env.js imports
// extensionless "next/server" that vitest cannot resolve. Same stub as
// lib/mcp-server/__tests__/resources.test.ts.
vi.mock("@/lib/compute-cap-table", () => ({ computeCapTableForCompany: vi.fn() }));

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

import { POST, DELETE, GET } from "../route";

let pat: string;
let companyId: string;
let scenarioId: string;

beforeAll(async () => {
  const user = await createUser();
  const company = await createCompany(user.id);
  await createMember(company.id, user.id, { role: "owner" });
  const scenario = await createScenario(company.id);
  companyId = company.id;
  scenarioId = scenario.id;
  const minted = await mintApiToken({
    userId: user.id,
    companyId: company.id,
    name: "keystone",
    scopes: ["read", "write", "delete"],
  });
  pat = minted.plaintext;
});

beforeEach(() => {
  mockExecuteToolCall.mockClear();
  mockGetAiFlags.mockClear();
  mockGetAiFlags.mockResolvedValue({ writeMode: "full" });
});

function rpc(body: unknown, opts?: { sessionId?: string; bearer?: string | null }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const bearer = opts?.bearer === undefined ? pat : opts.bearer;
  if (bearer) headers["authorization"] = `Bearer ${bearer}`;
  if (opts?.sessionId) headers["mcp-session-id"] = opts.sessionId;
  return new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers,
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
    clientInfo: { name: "keystone-test", version: "1.0.0" },
  },
};

async function openSession(): Promise<string> {
  const res = await POST(rpc(INIT));
  expect(res.status).toBe(200);
  const sessionId = res.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  // mirror real clients: send the initialized notification (202)
  const note = await POST(
    rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, { sessionId: sessionId! })
  );
  expect(note.status).toBe(202);
  return sessionId!;
}

describe("auth boundary", () => {
  it("no/invalid bearer → 401 with the PRM WWW-Authenticate pointer", async () => {
    const res = await POST(rpc(INIT, { bearer: null }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"'
    );
    const bad = await POST(rpc(INIT, { bearer: "bl_pat_wrong" }));
    expect(bad.status).toBe(401);
  });

  it("kill switch off → 403 for every call; tokens stay intact (B8)", async () => {
    const db = getTestDb();
    await db.update(companies).set({ mcpServerEnabled: false }).where(eq(companies.id, companyId));
    const res = await POST(rpc(INIT));
    expect(res.status).toBe(403);
    await db.update(companies).set({ mcpServerEnabled: true }).where(eq(companies.id, companyId));
    const back = await POST(rpc(INIT));
    expect(back.status).toBe(200); // same token works again
  });
});

describe("protocol roundtrip", () => {
  it("initialize → tools/list → tools/call get_metrics", async () => {
    const sessionId = await openSession();

    const list = await POST(
      rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, { sessionId })
    );
    expect(list.status).toBe(200);
    const tools = (await list.json()).result.tools as Array<{ name: string }>;
    const names = new Set(tools.map((t) => t.name));
    expect(names.has("get_metrics")).toBe(true);
    // exclusion list ON THE WIRE (spec §4.4)
    expect(names.has("show_metric_card")).toBe(false);
    expect(names.has("request_input_form")).toBe(false);
    expect(names.has("propose_plan")).toBe(false);
    expect(names.has("search_web")).toBe(false);
    expect(names.has("read_webpage")).toBe(false);
    expect(names.has("read_webpage_rendered")).toBe(false);

    const call = await POST(
      rpc(
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_metrics", arguments: {} } },
        { sessionId }
      )
    );
    expect(call.status).toBe(200);
    const body = await call.json();
    expect(JSON.parse(body.result.content[0].text)).toEqual({ ok: true, tool: "get_metrics" });
    expect(mockExecuteToolCall).toHaveBeenCalledWith(
      "get_metrics",
      {},
      expect.objectContaining({
        companyId,
        scenarioId: null,
        auditSource: "mcp_server",
        credentialType: "pat",
        clientInfo: { name: "keystone-test", version: "1.0.0" },
      })
    );
  });

  it("activate_scenario re-targets subsequent calls in the SAME session only", async () => {
    const sessionId = await openSession();
    const activate = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "activate_scenario", arguments: { scenarioId } },
        },
        { sessionId }
      )
    );
    const activateBody = await activate.json();
    expect(JSON.parse(activateBody.result.content[0].text).success).toBe(true);
    expect(mockExecuteToolCall).not.toHaveBeenCalled(); // intercepted

    await POST(
      rpc(
        { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_metrics", arguments: {} } },
        { sessionId }
      )
    );
    expect(mockExecuteToolCall).toHaveBeenCalledWith(
      "get_metrics",
      {},
      expect.objectContaining({ scenarioId })
    );

    // a FRESH session starts back at base view
    mockExecuteToolCall.mockClear();
    const otherSession = await openSession();
    await POST(
      rpc(
        { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "get_metrics", arguments: {} } },
        { sessionId: otherSession }
      )
    );
    expect(mockExecuteToolCall).toHaveBeenCalledWith(
      "get_metrics",
      {},
      expect.objectContaining({ scenarioId: null })
    );
  });

  it("writeMode read_only clamps writes through the full stack", async () => {
    mockGetAiFlags.mockResolvedValue({ writeMode: "read_only" });
    const sessionId = await openSession();
    const res = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "create_scenario", arguments: { name: "Blocked" } },
        },
        { sessionId }
      )
    );
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(JSON.parse(body.result.content[0].text).error).toContain("read-only");
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });

  it("session lifecycle: DELETE → 204; reuse → 404; GET → 405", async () => {
    const sessionId = await openSession();
    const del = await DELETE(
      new Request("http://localhost:3000/mcp", {
        method: "DELETE",
        headers: { authorization: `Bearer ${pat}`, "mcp-session-id": sessionId },
      })
    );
    expect(del.status).toBe(204);
    const reuse = await POST(
      rpc({ jsonrpc: "2.0", id: 8, method: "tools/list", params: {} }, { sessionId })
    );
    expect(reuse.status).toBe(404);
    const get = await GET(
      new Request("http://localhost:3000/mcp", {
        method: "GET",
        headers: { authorization: `Bearer ${pat}` },
      })
    );
    expect(get.status).toBe(405);
  });
});

describe("scope enforcement with a real read-only PAT", () => {
  it("write tool with a read-scoped token → scope error", async () => {
    const user = await createUser();
    await createMember(companyId, user.id, { role: "editor" });
    const minted = await mintApiToken({
      userId: user.id,
      companyId,
      name: "read-only",
      scopes: ["read"],
    });
    const init = await POST(rpc(INIT, { bearer: minted.plaintext }));
    const sessionId = init.headers.get("mcp-session-id")!;
    const res = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 9,
          method: "tools/call",
          params: { name: "create_scenario", arguments: { name: "Nope" } },
        },
        { sessionId, bearer: minted.plaintext }
      )
    );
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(JSON.parse(body.result.content[0].text).error).toContain('"write"');
    expect(mockExecuteToolCall).not.toHaveBeenCalled();
  });
});
