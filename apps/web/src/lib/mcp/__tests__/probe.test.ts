import { describe, it, expect, vi } from "vitest";
import { probeConnection } from "../probe";
import type { McpConnectionSpec } from "@burnless/mcp";

const SPEC: McpConnectionSpec = {
  id: "c1", slug: "s", transport: "streamable_http",
  endpoint: "https://s.example/mcp", authType: "none",
};

describe("probeConnection", () => {
  it("returns connected + tools on success", async () => {
    const manager = {
      getTools: vi.fn().mockResolvedValue([{ name: "t", inputSchema: { type: "object", properties: {} } }]),
      invalidate: vi.fn(),
    };
    const out = await probeConnection(SPEC, null, manager as never);
    expect(out).toEqual({
      status: "connected",
      tools: [{ name: "t", inputSchema: { type: "object", properties: {} } }],
      error: null,
    });
  });

  it("classifies 401/unauthorized as needs_auth (OAuth detected)", async () => {
    const manager = {
      getTools: vi.fn().mockRejectedValue(new Error("HTTP 401 Unauthorized")),
      invalidate: vi.fn(),
    };
    const out = await probeConnection(SPEC, null, manager as never);
    expect(out.status).toBe("needs_auth");
    expect(manager.invalidate).toHaveBeenCalledWith("c1");
  });

  it("classifies SDK StreamableHTTPError(code: 401) with a status-free message as needs_auth", async () => {
    // The real SDK throws `Streamable HTTP error: Error POSTing to endpoint: `
    // (empty body) with the HTTP status on `error.code` — NOT in the message.
    // Seen live against a bare-401 server in the mcp-connections e2e.
    const err = Object.assign(
      new Error("Streamable HTTP error: Error POSTing to endpoint: "),
      { code: 401 },
    );
    const manager = {
      getTools: vi.fn().mockRejectedValue(err),
      invalidate: vi.fn(),
    };
    const out = await probeConnection(SPEC, null, manager as never);
    expect(out.status).toBe("needs_auth");
  });

  it("classifies GitHub-style 400 'missing required Authorization header' as needs_auth", async () => {
    // GitHub's MCP endpoint returns 400 (not 401) when unauthenticated — seen in live smoke.
    const manager = {
      getTools: vi.fn().mockRejectedValue(
        new Error("Streamable HTTP error: Error POSTing to endpoint: bad request: missing required Authorization header\n")
      ),
      invalidate: vi.fn(),
    };
    const out = await probeConnection(SPEC, null, manager as never);
    expect(out.status).toBe("needs_auth");
  });

  it("classifies other failures as error with the message", async () => {
    const manager = {
      getTools: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      invalidate: vi.fn(),
    };
    const out = await probeConnection(SPEC, null, manager as never);
    expect(out.status).toBe("error");
    expect(out.error).toContain("ECONNREFUSED");
  });
});
