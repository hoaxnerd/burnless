/**
 * OAuth 2.1 token endpoint (expose spec §5.2). PUBLIC, form-encoded per
 * RFC 6749; CSRF-exempt + auth-tier rate-limited in middleware.
 * authorization_code: single-use hashed code + PKCE S256 + exact
 * redirect_uri + client + optional resource re-check. refresh_token:
 * rotation; superseded reuse revokes the grant family.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { consumeAuthCode, issueOauthTokens, rotateRefreshToken } from "@burnless/db";
import { withErrorHandler } from "@/lib/api-helpers";

function s256(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

function oauthError(error: string, description?: string): NextResponse {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

function tokenResponse(payload: {
  accessToken: string;
  refreshToken: string;
  scopes: string[];
}): NextResponse {
  return NextResponse.json(
    {
      access_token: payload.accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: payload.refreshToken,
      scope: payload.scopes.join(" "),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

export const POST = withErrorHandler(async (request: Request) => {
  const params = new URLSearchParams(await request.text());
  const grantType = params.get("grant_type");

  if (grantType === "authorization_code") {
    const code = params.get("code");
    const redirectUri = params.get("redirect_uri");
    const clientId = params.get("client_id");
    const codeVerifier = params.get("code_verifier");
    const resource = params.get("resource");
    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return oauthError("invalid_request", "code, redirect_uri, client_id and code_verifier are required");
    }
    const row = await consumeAuthCode(code); // single-use, unexpired (spec §5.2)
    if (!row) return oauthError("invalid_grant");
    if (row.clientId !== clientId) return oauthError("invalid_grant");
    if (row.redirectUri !== redirectUri) return oauthError("invalid_grant");
    if (s256(codeVerifier) !== row.codeChallenge) return oauthError("invalid_grant"); // PKCE S256 only
    if (resource && resource !== row.resource) return oauthError("invalid_grant"); // RFC 8707

    const issued = await issueOauthTokens({
      clientId: row.clientId,
      userId: row.userId,
      companyId: row.companyId,
      scopes: row.scopes,
      resource: row.resource,
    });
    return tokenResponse({
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      scopes: row.scopes,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) return oauthError("invalid_request", "refresh_token is required");
    const result = await rotateRefreshToken(refreshToken);
    if (result.status !== "rotated") return oauthError("invalid_grant");
    return tokenResponse({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      scopes: result.row.scopes,
    });
  }

  return oauthError("unsupported_grant_type");
});
