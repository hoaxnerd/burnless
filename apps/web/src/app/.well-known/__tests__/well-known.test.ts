/**
 * Discovery documents (spec §4.1): RFC 9728 PRM + RFC 8414 AS metadata,
 * both derived from APP_URL, public, CORS-open.
 */
import { describe, it, expect } from "vitest";

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

import { GET as prm } from "../oauth-protected-resource/route";
import { GET as asMetadata } from "../oauth-authorization-server/route";

describe("/.well-known/oauth-protected-resource (RFC 9728)", () => {
  it("names the MCP resource and our own AS", async () => {
    const res = await prm();
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body).toEqual({
      resource: "http://localhost:3000/mcp",
      authorization_servers: ["http://localhost:3000"],
      scopes_supported: ["read", "write", "delete"],
      bearer_methods_supported: ["header"],
    });
  });
});

describe("/.well-known/oauth-authorization-server (RFC 8414)", () => {
  it("advertises the real endpoints, S256-only PKCE, code+refresh grants", async () => {
    const res = await asMetadata();
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body).toEqual({
      issuer: "http://localhost:3000",
      authorization_endpoint: "http://localhost:3000/oauth/authorize",
      token_endpoint: "http://localhost:3000/api/oauth/token",
      registration_endpoint: "http://localhost:3000/api/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read", "write", "delete"],
    });
  });
});
