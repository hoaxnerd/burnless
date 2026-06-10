/**
 * Minimal OAuth 2.1 AS queries (expose spec §5.2): public clients + PKCE,
 * hashed codes/tokens at rest, refresh rotation with reuse-detection family
 * revocation (OAuth 2.1 public-client posture).
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../index";
import { oauthClients, oauthAuthCodes, oauthTokens } from "../schema";
import { generateSecretToken, sha256hex } from "../token-hash";
import type { McpScope } from "./api-tokens";

export type OauthClientRow = typeof oauthClients.$inferSelect;
export type OauthAuthCodeRow = typeof oauthAuthCodes.$inferSelect;
export type OauthTokenRow = typeof oauthTokens.$inferSelect;

/** Spec §5.2: 10-min single-use codes, 1-hour access tokens. */
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function createOauthClient(input: {
  name: string;
  redirectUris: string[];
}): Promise<OauthClientRow> {
  const [row] = await db
    .insert(oauthClients)
    .values({ name: input.name, redirectUris: input.redirectUris })
    .returning();
  return row!;
}

export async function getOauthClientById(clientId: string): Promise<OauthClientRow | null> {
  const rows = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, clientId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  companyId: string;
  scopes: McpScope[];
  codeChallenge: string;
  resource: string;
  redirectUri: string;
}): Promise<{ code: string }> {
  const generated = generateSecretToken("bl_ac_");
  await db.insert(oauthAuthCodes).values({
    codeHash: generated.hash,
    clientId: input.clientId,
    userId: input.userId,
    companyId: input.companyId,
    scopes: input.scopes,
    codeChallenge: input.codeChallenge,
    resource: input.resource,
    redirectUri: input.redirectUri,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return { code: generated.token };
}

/** Atomically consume a code: sets usedAt iff unused AND unexpired.
 *  The UPDATE … RETURNING makes single-use race-safe. */
export async function consumeAuthCode(code: string): Promise<OauthAuthCodeRow | null> {
  const rows = await db
    .update(oauthAuthCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(oauthAuthCodes.codeHash, sha256hex(code)),
        isNull(oauthAuthCodes.usedAt),
        gt(oauthAuthCodes.expiresAt, new Date())
      )
    )
    .returning();
  return rows[0] ?? null;
}

export interface IssuedOauthTokens {
  accessToken: string;
  refreshToken: string;
  row: OauthTokenRow;
}

export async function issueOauthTokens(input: {
  /** Omit for a fresh grant; pass to keep a rotation in the same family. */
  grantId?: string;
  clientId: string;
  userId: string;
  companyId: string;
  scopes: McpScope[];
  resource: string;
}): Promise<IssuedOauthTokens> {
  const access = generateSecretToken("bl_at_");
  const refresh = generateSecretToken("bl_rt_");
  const [row] = await db
    .insert(oauthTokens)
    .values({
      grantId: input.grantId ?? crypto.randomUUID(),
      clientId: input.clientId,
      userId: input.userId,
      companyId: input.companyId,
      scopes: input.scopes,
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      resource: input.resource,
      accessExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    })
    .returning();
  return { accessToken: access.token, refreshToken: refresh.token, row: row! };
}

export async function findOauthTokenByAccessHash(
  accessTokenHash: string
): Promise<OauthTokenRow | null> {
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.accessTokenHash, accessTokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export type RotateResult =
  | ({ status: "rotated" } & IssuedOauthTokens)
  | { status: "reuse_detected" }
  | { status: "invalid" };

/** OAuth 2.1 refresh rotation. Presenting a SUPERSEDED refresh token is
 *  evidence of theft → revoke the entire grant family (spec §5.2). */
export async function rotateRefreshToken(refreshToken: string): Promise<RotateResult> {
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.refreshTokenHash, sha256hex(refreshToken)))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return { status: "invalid" };
  if (row.supersededAt) {
    await db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthTokens.grantId, row.grantId), isNull(oauthTokens.revokedAt)));
    return { status: "reuse_detected" };
  }
  await db
    .update(oauthTokens)
    .set({ supersededAt: new Date() })
    .where(eq(oauthTokens.id, row.id));
  const issued = await issueOauthTokens({
    grantId: row.grantId,
    clientId: row.clientId,
    userId: row.userId,
    companyId: row.companyId,
    scopes: row.scopes,
    resource: row.resource,
  });
  return { status: "rotated", ...issued };
}

export interface OauthGrantSummary {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: McpScope[];
  createdAt: Date;
}

/** Connected-apps list: the current (non-superseded, non-revoked) row per
 *  grant family for this user+company. */
export async function listOauthGrantsForUser(
  companyId: string,
  userId: string
): Promise<OauthGrantSummary[]> {
  return db
    .select({
      grantId: oauthTokens.grantId,
      clientId: oauthTokens.clientId,
      clientName: oauthClients.name,
      scopes: oauthTokens.scopes,
      createdAt: oauthTokens.createdAt,
    })
    .from(oauthTokens)
    .innerJoin(oauthClients, eq(oauthTokens.clientId, oauthClients.id))
    .where(
      and(
        eq(oauthTokens.companyId, companyId),
        eq(oauthTokens.userId, userId),
        isNull(oauthTokens.revokedAt),
        isNull(oauthTokens.supersededAt)
      )
    );
}

/** Revoke an entire grant family — kills access + refresh instantly (spec §5.2). */
export async function revokeOauthGrant(
  grantId: string,
  companyId: string,
  userId: string
): Promise<boolean> {
  const rows = await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(oauthTokens.grantId, grantId),
        eq(oauthTokens.companyId, companyId),
        eq(oauthTokens.userId, userId),
        isNull(oauthTokens.revokedAt)
      )
    )
    .returning({ id: oauthTokens.id });
  return rows.length > 0;
}
