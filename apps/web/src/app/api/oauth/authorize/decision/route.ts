/**
 * Consent decision endpoint (expose spec §5.2): the consent screen POSTs
 * here. Session-authed (the consent page already required login); re-validates
 * everything server-side (client, exact redirect, S256-only, resource,
 * membership) and caps scopes downgrade-only by role. NEVER trusts the
 * browser's earlier validation.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  companyMembers,
  getOauthClientById,
  createAuthCode,
  roleScopeCap,
  type McpScope,
} from "@burnless/db";
import { withErrorHandler, parseBody, errorResponse, getAuthUser } from "@/lib/api-helpers";
import { env } from "@/lib/env";

const decisionSchema = z.object({
  client_id: z.string().min(1).max(100),
  redirect_uri: z.string().min(1).max(2000),
  state: z.string().max(2000).nullable().optional(),
  code_challenge: z.string().min(1).max(500),
  resource: z.string().min(1).max(2000),
  scopes: z.array(z.enum(["read", "write", "delete"])).min(1).max(3),
  company_id: z.string().min(1).max(100),
  decision: z.enum(["approve", "deny"]),
});

export const POST = withErrorHandler(async (request: Request) => {
  const user = await getAuthUser();
  if (!user?.id) return errorResponse("Unauthorized", 401);

  const parsed = await parseBody(request, decisionSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  const client = await getOauthClientById(body.client_id);
  if (!client) return errorResponse("Unknown client", 400);
  if (!client.redirectUris.includes(body.redirect_uri)) {
    // NEVER redirect to an unvalidated redirect_uri — hard error instead.
    return errorResponse("redirect_uri does not match the registered value", 400);
  }
  if (body.resource !== `${env.APP_URL}/mcp`) {
    return errorResponse("resource must be this instance's MCP endpoint", 400);
  }

  const stateSuffix = body.state ? `&state=${encodeURIComponent(body.state)}` : "";

  if (body.decision === "deny") {
    return NextResponse.json({
      redirectTo: `${body.redirect_uri}?error=access_denied${stateSuffix}`,
    });
  }

  // Membership + role cap (spec §5.2: user may downgrade, not upgrade;
  // role caps everything).
  const [membership] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, user.id), eq(companyMembers.companyId, body.company_id)))
    .limit(1);
  if (!membership) return errorResponse("You are not a member of that company", 403);

  const cap = roleScopeCap(membership.role);
  const scopes = ([...new Set(body.scopes)] as McpScope[]).filter((s) => cap.includes(s));
  if (scopes.length === 0) return errorResponse("Your role grants none of the requested scopes", 403);

  const { code } = await createAuthCode({
    clientId: client.id,
    userId: user.id,
    companyId: body.company_id,
    scopes,
    codeChallenge: body.code_challenge,
    resource: body.resource,
    redirectUri: body.redirect_uri,
  });

  return NextResponse.json({
    redirectTo: `${body.redirect_uri}?code=${encodeURIComponent(code)}${stateSuffix}`,
  });
});
