/**
 * Bridges @burnless/mcp's OAuthPersistence to mcpCredentials rows.
 * Tokens land ENCRYPTED via saveMcpCredentials; OAuth machinery state
 * (clientInfo / codeVerifier / pendingState) lives in clientRegistration jsonb.
 */
import {
  getMcpCredentialsRow,
  saveMcpCredentials,
  getDecryptedMcpSecret,
} from "@burnless/db";
import type { OAuthPersistence } from "@burnless/mcp";

export function dbOAuthPersistence(connectionId: string): OAuthPersistence {
  return {
    async loadClientInfo() {
      const row = await getMcpCredentialsRow(connectionId);
      return (row?.clientRegistration?.clientInfo ?? undefined) as never;
    },
    async saveClientInfo(info) {
      const row = await getMcpCredentialsRow(connectionId);
      await saveMcpCredentials(connectionId, "oauth", null, {
        ...row?.clientRegistration,
        clientInfo: info as unknown as Record<string, unknown>,
      });
    },
    async loadTokens() {
      const secret = await getDecryptedMcpSecret(connectionId);
      if (!secret || !("accessToken" in secret)) return undefined;
      return {
        access_token: secret.accessToken,
        token_type: "Bearer",
        ...(secret.refreshToken ? { refresh_token: secret.refreshToken } : {}),
      } as never;
    },
    async saveTokens(tokens) {
      const row = await getMcpCredentialsRow(connectionId);
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : undefined;
      await saveMcpCredentials(
        connectionId,
        "oauth",
        {
          accessToken: tokens.access_token,
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          ...(expiresAt ? { expiresAt } : {}),
        },
        row?.clientRegistration ?? undefined
      );
    },
    async loadCodeVerifier() {
      const row = await getMcpCredentialsRow(connectionId);
      const v = row?.clientRegistration?.codeVerifier;
      if (!v) throw new Error("No PKCE code verifier stored — restart the authorization");
      return v;
    },
    async saveCodeVerifier(verifier) {
      const row = await getMcpCredentialsRow(connectionId);
      await saveMcpCredentials(connectionId, "oauth", null, {
        ...row?.clientRegistration,
        codeVerifier: verifier,
      });
    },
  };
}
