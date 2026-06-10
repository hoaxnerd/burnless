/**
 * RFC 9728 protected resource metadata (expose spec §4.1). Public GET —
 * MCP clients land here from the 401 WWW-Authenticate pointer and learn
 * which AS protects ${APP_URL}/mcp (ours, co-hosted — spec §5.2).
 */
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      resource: `${env.APP_URL}/mcp`,
      authorization_servers: [env.APP_URL],
      scopes_supported: ["read", "write", "delete"],
      bearer_methods_supported: ["header"],
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } }
  );
}
