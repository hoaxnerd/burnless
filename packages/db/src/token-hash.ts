/**
 * One-way token hashing + secret generation for the exposed MCP server
 * (expose spec §5.1/§5.5). Deliberately hash-not-encrypt: these secrets are
 * never read back — a DB leak exposes nothing usable. crypto.ts (AES-GCM)
 * remains the home for retrievable secrets.
 */
import { createHash, randomBytes } from "node:crypto";

/** Secret-scanner-friendly prefixes (spec §5.1).
 *  pat = personal access token, at = OAuth access, rt = OAuth refresh,
 *  ac = authorization code. */
export type BurnlessTokenPrefix = "bl_pat_" | "bl_at_" | "bl_rt_" | "bl_ac_";

export function sha256hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export interface GeneratedSecret {
  /** Full plaintext token — show once, never persist. */
  token: string;
  /** sha256hex(token) — the only thing stored at rest. */
  hash: string;
  /** Last 4 chars of the secret part — UI mask material, not secret. */
  lastFour: string;
}

/** `<prefix>` + 32 random bytes base64url (43 chars). */
export function generateSecretToken(prefix: BurnlessTokenPrefix): GeneratedSecret {
  const secret = randomBytes(32).toString("base64url");
  const token = `${prefix}${secret}`;
  return { token, hash: sha256hex(token), lastFour: secret.slice(-4) };
}
