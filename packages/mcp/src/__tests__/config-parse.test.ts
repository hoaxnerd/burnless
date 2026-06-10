import { describe, it, expect } from "vitest";
import { parseMcpConfig } from "../config-parse";
import { McpConfigError } from "../types";

describe("parseMcpConfig", () => {
  it("parses a bare name→server map (http)", () => {
    const out = parseMcpConfig(`{"stripe":{"type":"streamable-http","url":"https://mcp.stripe.com"}}`);
    expect(out).toEqual([
      { name: "stripe", transport: "streamable_http", url: "https://mcp.stripe.com", command: undefined, args: [], headers: {}, env: {} },
    ]);
  });

  it("accepts the mcpServers wrapper and type aliases http/streamable_http", () => {
    const out = parseMcpConfig(
      `{"mcpServers":{"a":{"type":"http","url":"https://a.example/mcp"},"b":{"type":"streamable_http","url":"https://b.example/mcp"}}}`
    );
    expect(out.map((s) => s.transport)).toEqual(["streamable_http", "streamable_http"]);
  });

  it("infers stdio from a command, carrying args + env", () => {
    const out = parseMcpConfig(
      `{"db":{"command":"npx","args":["-y","dbhub"],"env":{"DSN":"postgres://..."} }}`
    );
    expect(out[0]).toMatchObject({ name: "db", transport: "stdio", command: "npx", args: ["-y", "dbhub"], env: { DSN: "postgres://..." } });
  });

  it("infers streamable_http from a bare url, keeping headers", () => {
    const out = parseMcpConfig(`{"gh":{"url":"https://api.example/mcp","headers":{"Authorization":"Bearer x"}}}`);
    expect(out[0]).toMatchObject({ transport: "streamable_http", headers: { Authorization: "Bearer x" } });
  });

  it("rejects invalid JSON, empty maps, sse, and entries with neither url nor command", () => {
    expect(() => parseMcpConfig("{nope")).toThrow(McpConfigError);
    expect(() => parseMcpConfig(`{}`)).toThrow(McpConfigError);
    expect(() => parseMcpConfig(`{"x":{"type":"sse","url":"https://a/sse"}}`)).toThrow(/deprecated/i);
    expect(() => parseMcpConfig(`{"x":{}}`)).toThrow(McpConfigError);
  });
});
