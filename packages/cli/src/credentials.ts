/**
 * Typed codec for the secret blob stored in the keychain under each profile.
 * Two shapes: a PAT (spec §5.1, `bl_pat_…`) or an OAuth credential bundle
 * (client registration + tokens + PKCE verifier — spec §5.2 / §7.3).
 */
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Keychain } from "./keychain";

export interface StoredPat {
  kind: "pat";
  token: string;
}

export interface StoredOAuth {
  kind: "oauth";
  clientInfo?: OAuthClientInformationFull;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  /** ms epoch when `tokens` was last saved — drives proactive refresh. */
  obtainedAt?: number;
}

export type StoredCredential = StoredPat | StoredOAuth;

export async function loadCredential(keychain: Keychain, profileName: string): Promise<StoredCredential | null> {
  const raw = await keychain.get(profileName);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCredential;
    if (parsed && (parsed.kind === "pat" || parsed.kind === "oauth")) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function saveCredential(
  keychain: Keychain,
  profileName: string,
  credential: StoredCredential
): Promise<void> {
  await keychain.set(profileName, JSON.stringify(credential));
}

export async function deleteCredential(keychain: Keychain, profileName: string): Promise<void> {
  await keychain.delete(profileName);
}
