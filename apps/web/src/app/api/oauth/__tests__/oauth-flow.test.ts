/**
 * OAuth AS end-to-end (spec §5.2/§8): DCR → consent decision → code → PKCE
 * token exchange → verifier accepts the access token → refresh rotation →
 * reuse-detection family revocation. Plus negative paths: bad redirect_uri,
 * bad verifier, reused code, scope downgrade-only.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { createUser, createCompany, createMember } from "@db-test/factories";
import { verifyMcpBearer } from "@/lib/mcp-server/auth";

const { mockGetAuthUser } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
}));

// Note: importOriginal cannot be used here because api-helpers transitively
// imports next-auth which is unavailable in the test environment (same
// constraint as tokens.test.ts). We provide real implementations of
// parseBody and errorResponse inline.
vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: mockGetAuthUser,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
  errorResponse: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  parseBody: async (request: Request, schema: { parse: (d: unknown) => unknown }) => {
    const { NextResponse } = await import("next/server");
    try {
      const body = await request.json();
      return { data: schema.parse(body) };
    } catch {
      return {
        error: NextResponse.json({ error: "Invalid request body" }, { status: 400 }),
      };
    }
  },
}));

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
const RESOURCE = "http://localhost:3000/mcp";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

import { POST as register } from "../register/route";
import { POST as token } from "../token/route";
import { POST as decision } from "../authorize/decision/route";

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formReq(params: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
  return { verifier, challenge };
}

let userId: string;
let companyId: string;

beforeAll(async () => {
  const user = await createUser();
  const company = await createCompany(user.id);
  await createMember(company.id, user.id, { role: "owner" });
  userId = user.id;
  companyId = company.id;
  mockGetAuthUser.mockResolvedValue({ id: user.id, email: "t@t.t" });
});

async function registerClient(): Promise<string> {
  const res = await register(
    jsonReq("http://localhost:3000/api/oauth/register", {
      client_name: "Claude",
      redirect_uris: [REDIRECT],
    })
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.token_endpoint_auth_method).toBe("none");
  return body.client_id as string;
}

async function approveAndGetCode(clientId: string, challenge: string, scopes = ["read", "write"]) {
  const res = await decision(
    jsonReq("http://localhost:3000/api/oauth/authorize/decision", {
      client_id: clientId,
      redirect_uri: REDIRECT,
      state: "xyz",
      code_challenge: challenge,
      resource: RESOURCE,
      scopes,
      company_id: companyId,
      decision: "approve",
    })
  );
  expect(res.status).toBe(200);
  const { redirectTo } = await res.json();
  const url = new URL(redirectTo);
  expect(url.origin + url.pathname).toBe(REDIRECT);
  expect(url.searchParams.get("state")).toBe("xyz");
  return url.searchParams.get("code")!;
}

describe("DCR (spec §5.2)", () => {
  it("registers a public client; rejects non-https non-localhost redirect uris", async () => {
    await registerClient();
    const bad = await register(
      jsonReq("http://localhost:3000/api/oauth/register", {
        client_name: "Evil",
        redirect_uris: ["http://192.168.1.5/cb"],
      })
    );
    expect(bad.status).toBe(400);
  });
});

describe("authorization_code + PKCE S256", () => {
  it("full happy path: code → tokens → verifier accepts the access token", async () => {
    const clientId = await registerClient();
    const { verifier, challenge } = pkcePair();
    const code = await approveAndGetCode(clientId, challenge);

    const res = await token(
      formReq({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier,
        resource: RESOURCE,
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(body.access_token).toMatch(/^bl_at_/);
    expect(body.refresh_token).toMatch(/^bl_rt_/);
    expect(body.scope).toBe("read write");

    const authResult = await verifyMcpBearer(`Bearer ${body.access_token}`);
    expect(authResult?.companyId).toBe(companyId);
    expect(authResult?.userId).toBe(userId);
    expect(authResult?.credentialType).toBe("oauth");
  });

  it("wrong PKCE verifier → invalid_grant; code is consumed (single-use)", async () => {
    const clientId = await registerClient();
    const { challenge } = pkcePair();
    const code = await approveAndGetCode(clientId, challenge);
    const bad = await token(
      formReq({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier-wrong",
      })
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("invalid_grant");
    // single-use: retrying with the RIGHT verifier still fails
    const retry = await token(
      formReq({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: "anything",
      })
    );
    expect(retry.status).toBe(400);
  });

  it("redirect_uri / client_id mismatch → invalid_grant", async () => {
    const clientId = await registerClient();
    const { verifier, challenge } = pkcePair();
    const code = await approveAndGetCode(clientId, challenge);
    const res = await token(
      formReq({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://attacker.example/cb",
        client_id: clientId,
        code_verifier: verifier,
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("decision caps scopes downgrade-only by role (viewer approving write keeps read only)", async () => {
    const viewer = await createUser();
    await createMember(companyId, viewer.id, { role: "viewer" });
    mockGetAuthUser.mockResolvedValueOnce({ id: viewer.id, email: "v@t.t" });
    const clientId = await registerClient();
    const { verifier, challenge } = pkcePair();
    const res = await decision(
      jsonReq("http://localhost:3000/api/oauth/authorize/decision", {
        client_id: clientId,
        redirect_uri: REDIRECT,
        state: "s",
        code_challenge: challenge,
        resource: RESOURCE,
        scopes: ["read", "write", "delete"],
        company_id: companyId,
        decision: "approve",
      })
    );
    const { redirectTo } = await res.json();
    const code = new URL(redirectTo).searchParams.get("code")!;
    const tokenRes = await token(
      formReq({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier,
      })
    );
    expect((await tokenRes.json()).scope).toBe("read");
  });

  it("deny → access_denied redirect, no code minted", async () => {
    const clientId = await registerClient();
    const { challenge } = pkcePair();
    const res = await decision(
      jsonReq("http://localhost:3000/api/oauth/authorize/decision", {
        client_id: clientId,
        redirect_uri: REDIRECT,
        state: "st8",
        code_challenge: challenge,
        resource: RESOURCE,
        scopes: ["read"],
        company_id: companyId,
        decision: "deny",
      })
    );
    const { redirectTo } = await res.json();
    const url = new URL(redirectTo);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("code")).toBeNull();
  });
});

describe("refresh_token grant (spec §5.2 rotation)", () => {
  it("rotates; reusing the old refresh token revokes the family", async () => {
    const clientId = await registerClient();
    const { verifier, challenge } = pkcePair();
    const code = await approveAndGetCode(clientId, challenge);
    const first = await (
      await token(
        formReq({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: clientId,
          code_verifier: verifier,
        })
      )
    ).json();

    const rotated = await token(
      formReq({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId })
    );
    expect(rotated.status).toBe(200);
    const second = await rotated.json();
    expect(second.refresh_token).not.toBe(first.refresh_token);

    // reuse → 400 invalid_grant AND the new tokens die too (family revocation)
    const reuse = await token(
      formReq({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId })
    );
    expect(reuse.status).toBe(400);
    expect(await verifyMcpBearer(`Bearer ${second.access_token}`)).toBeNull();
  });

  it("refresh is client-bound: missing client_id → invalid_request; mismatched client_id → invalid_grant without burning the token (RFC 6749 §6)", async () => {
    const clientId = await registerClient();
    const otherClientId = await registerClient();
    const { verifier, challenge } = pkcePair();
    const code = await approveAndGetCode(clientId, challenge);
    const first = await (
      await token(
        formReq({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: clientId,
          code_verifier: verifier,
        })
      )
    ).json();

    // missing client_id → invalid_request (public client MUST send it)
    const missing = await token(
      formReq({ grant_type: "refresh_token", refresh_token: first.refresh_token })
    );
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("invalid_request");

    // a different registered client presenting a stolen token → invalid_grant
    const wrong = await token(
      formReq({
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id: otherClientId,
      })
    );
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toBe("invalid_grant");

    // the mismatch did NOT burn the grant: access token still verifies …
    expect(await verifyMcpBearer(`Bearer ${first.access_token}`)).not.toBeNull();
    // … and the legitimate client still rotates fine
    const ok = await token(
      formReq({
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id: clientId,
      })
    );
    expect(ok.status).toBe(200);
  });

  it("unknown grant_type → unsupported_grant_type", async () => {
    const res = await token(formReq({ grant_type: "password", username: "x", password: "y" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_grant_type");
  });
});
