/**
 * Bearer verifier for the exposed MCP server — ONE seam, two modes (spec
 * §5.4): PAT (bl_pat_) and OAuth access token (bl_at_). The server core
 * never learns which mode authenticated the caller. Re-runs the live
 * membership check + role∩token scope intersection on EVERY call (spec
 * §4.3 step 2 / §5.1): removed member ⇒ dead tokens; demoted ⇒ shrunk scopes.
 */
import { and, eq } from "drizzle-orm";
import {
  db,
  companyMembers,
  sha256hex,
  findApiTokenByHash,
  touchApiTokenLastUsed,
  findOauthTokenByAccessHash,
  roleScopeCap,
  type McpScope,
} from "@burnless/db";
import { env } from "@/lib/env";

export interface McpAuthResult {
  userId: string;
  companyId: string;
  /** Effective scopes = token scopes ∩ role cap. */
  scopes: McpScope[];
  credentialType: "pat" | "oauth";
  /** apiTokens.id (PAT) or oauthTokens.grantId (OAuth) — stable across
   *  refresh rotation, so sessions + audit survive a token refresh. */
  credentialId: string;
}

/** 401 with the RFC 9728 protected-resource-metadata pointer (spec §4.3 step 1). */
export function mcpUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${env.APP_URL}/.well-known/oauth-protected-resource"`,
    },
  });
}

export async function verifyMcpBearer(header: string | null): Promise<McpAuthResult | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  let userId: string;
  let companyId: string;
  let tokenScopes: McpScope[];
  let credentialType: "pat" | "oauth";
  let credentialId: string;

  if (token.startsWith("bl_pat_")) {
    const row = await findApiTokenByHash(sha256hex(token));
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
    // Throttled usage stamp — fire-and-forget (spec §5.1).
    void touchApiTokenLastUsed(row.id).catch(() => {});
    userId = row.userId;
    companyId = row.companyId;
    tokenScopes = row.scopes;
    credentialType = "pat";
    credentialId = row.id;
  } else if (token.startsWith("bl_at_")) {
    const row = await findOauthTokenByAccessHash(sha256hex(token));
    if (!row || row.revokedAt || row.supersededAt) return null;
    if (row.accessExpiresAt.getTime() <= Date.now()) return null;
    // RFC 8707 audience binding (spec §5.2): reject tokens minted for
    // another instance's MCP endpoint.
    if (row.resource !== `${env.APP_URL}/mcp`) return null;
    userId = row.userId;
    companyId = row.companyId;
    tokenScopes = row.scopes;
    credentialType = "oauth";
    credentialId = row.grantId;
  } else {
    return null;
  }

  const [membership] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, userId), eq(companyMembers.companyId, companyId)))
    .limit(1);
  if (!membership) return null;

  const cap = roleScopeCap(membership.role);
  const scopes = tokenScopes.filter((s) => cap.includes(s));
  return { userId, companyId, scopes, credentialType, credentialId };
}
