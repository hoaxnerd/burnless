/**
 * Personal-access-token queries for the exposed MCP server (expose spec §5.1).
 * Only SHA-256 hashes at rest; mint returns the plaintext exactly once.
 */
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../index";
import { apiTokens } from "../schema";
import { generateSecretToken, sha256hex } from "../token-hash";

export type McpScope = "read" | "write" | "delete";

export type ApiTokenRow = typeof apiTokens.$inferSelect;

/** Role → mintable/effective scope cap (spec §5.1). Re-applied at EVERY
 *  verify so demotion bites immediately. Unknown roles get nothing. */
export function roleScopeCap(role: string): McpScope[] {
  if (role === "viewer") return ["read"];
  if (role === "editor" || role === "admin" || role === "owner") {
    return ["read", "write", "delete"];
  }
  return [];
}

export interface MintedApiToken {
  row: ApiTokenRow;
  /** Plaintext — surfaced once at mint, never stored. */
  plaintext: string;
}

export async function mintApiToken(input: {
  userId: string;
  companyId: string;
  name: string;
  scopes: McpScope[];
  expiresAt?: Date | null;
}): Promise<MintedApiToken> {
  const generated = generateSecretToken("bl_pat_");
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId: input.userId,
      companyId: input.companyId,
      name: input.name,
      tokenHash: generated.hash,
      scopes: input.scopes,
      lastFour: generated.lastFour,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return { row: row!, plaintext: generated.token };
}

/** Active (non-revoked) tokens of one user in one company — the UI list. */
export async function listApiTokensForUser(
  companyId: string,
  userId: string
): Promise<ApiTokenRow[]> {
  return db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.companyId, companyId),
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt)
      )
    );
}

/** Revocation is instant (spec §5.1) and scoped to the token's owner. */
export async function revokeApiToken(
  id: string,
  companyId: string,
  userId: string
): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, id),
        eq(apiTokens.companyId, companyId),
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt)
      )
    )
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

/** Lookup by hash — the verifier checks revokedAt/expiresAt itself so it can
 *  distinguish failure modes. */
export async function findApiTokenByHash(tokenHash: string): Promise<ApiTokenRow | null> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

/** Update lastUsedAt, throttled to ≥60s between writes (spec §5.1). */
export async function touchApiTokenLastUsed(id: string): Promise<void> {
  const cutoff = new Date(Date.now() - 60_000);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, id),
        or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, cutoff))
      )
    );
}
