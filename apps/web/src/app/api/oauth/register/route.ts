/**
 * RFC 7591 dynamic client registration (expose spec §5.2). PUBLIC endpoint
 * (no session — agents call it before any user is involved); CSRF-exempt +
 * auth-tier rate-limited in middleware. Registers public clients only
 * (token_endpoint_auth_method "none"); redirect URIs must be exact HTTPS
 * or localhost.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createOauthClient } from "@burnless/db";
import { withErrorHandler, parseBody, errorResponse } from "@/lib/api-helpers";

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    return (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

const registerSchema = z.object({
  client_name: z.string().min(1).max(200),
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
});

export const POST = withErrorHandler(async (request: Request) => {
  const parsed = await parseBody(request, registerSchema);
  if ("error" in parsed) return parsed.error;

  const bad = parsed.data.redirect_uris.filter((u) => !isAllowedRedirectUri(u));
  if (bad.length > 0) {
    return errorResponse(
      `redirect_uris must be HTTPS or localhost; rejected: ${bad.join(", ")}`,
      400
    );
  }

  const client = await createOauthClient({
    name: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
  });

  return NextResponse.json(
    {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 }
  );
});
