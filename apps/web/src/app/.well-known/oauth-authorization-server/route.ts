/**
 * RFC 8414 authorization-server metadata (expose spec §4.1). Endpoint paths
 * are advertised here, so clients never guess them: the human consent page
 * is /oauth/authorize; the machine endpoints live under /api/oauth/*.
 */
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      issuer: env.APP_URL,
      authorization_endpoint: `${env.APP_URL}/oauth/authorize`,
      token_endpoint: `${env.APP_URL}/api/oauth/token`,
      registration_endpoint: `${env.APP_URL}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read", "write", "delete"],
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } }
  );
}
