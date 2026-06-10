/**
 * OAuth 2.1 client glue (spec §3.1 oauth-client, §5 security).
 * The SDK's auth() implements discovery (RFC 9728 → 8414), DCR (RFC 7591),
 * PKCE, and the RFC 8707 resource parameter. We inject persistence and capture
 * the authorization redirect so the web app can hand the URL to the browser.
 */
import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export interface OAuthPersistence {
  loadClientInfo(): Promise<OAuthClientInformation | undefined>;
  saveClientInfo(info: OAuthClientInformationFull): Promise<void>;
  loadTokens(): Promise<OAuthTokens | undefined>;
  saveTokens(tokens: OAuthTokens): Promise<void>;
  loadCodeVerifier(): Promise<string>;
  saveCodeVerifier(verifier: string): Promise<void>;
}

export interface DbBackedProviderOptions {
  serverUrl: string;
  redirectUrl: string;
  persistence: OAuthPersistence;
}

/** What the SDK auth() returns; re-typed here so the web app never imports SDK internals. */
export type AuthResult = "AUTHORIZED" | "REDIRECT";
export type AuthFn = (
  provider: OAuthClientProvider,
  options: { serverUrl: string; authorizationCode?: string }
) => Promise<AuthResult>;

class CapturingProvider implements OAuthClientProvider {
  capturedAuthorizationUrl: URL | null = null;

  constructor(private opts: DbBackedProviderOptions) {}

  get redirectUrl(): string {
    return this.opts.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Burnless",
      redirect_uris: [this.opts.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // public client + PKCE
    };
  }

  clientInformation(): Promise<OAuthClientInformation | undefined> {
    return this.opts.persistence.loadClientInfo();
  }
  saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    return this.opts.persistence.saveClientInfo(info);
  }
  tokens(): Promise<OAuthTokens | undefined> {
    return this.opts.persistence.loadTokens();
  }
  saveTokens(tokens: OAuthTokens): Promise<void> {
    return this.opts.persistence.saveTokens(tokens);
  }
  redirectToAuthorization(authorizationUrl: URL): void {
    this.capturedAuthorizationUrl = authorizationUrl;
  }
  saveCodeVerifier(verifier: string): Promise<void> {
    return this.opts.persistence.saveCodeVerifier(verifier);
  }
  codeVerifier(): Promise<string> {
    return this.opts.persistence.loadCodeVerifier();
  }
}

export function createDbBackedProvider(opts: DbBackedProviderOptions): CapturingProvider {
  return new CapturingProvider(opts);
}

/** Run the discovery/DCR/PKCE chain until the user must authorize in a browser.
 *  Returns the authorization URL to send them to. */
export async function beginOAuth(
  provider: CapturingProvider,
  serverUrl: string,
  authFn: AuthFn = auth as unknown as AuthFn
): Promise<URL> {
  const result = await authFn(provider, { serverUrl });
  if (result === "REDIRECT" || provider.capturedAuthorizationUrl) {
    if (!provider.capturedAuthorizationUrl) {
      throw new Error("OAuth flow requested a redirect but no authorization URL was captured");
    }
    return provider.capturedAuthorizationUrl;
  }
  throw new Error("Server reports this connection is already authorized — no redirect needed");
}

/** Exchange the callback code for tokens (persisted via the provider). */
export async function completeOAuth(
  provider: CapturingProvider,
  serverUrl: string,
  authorizationCode: string,
  authFn: AuthFn = auth as unknown as AuthFn
): Promise<void> {
  const result = await authFn(provider, { serverUrl, authorizationCode });
  if (result !== "AUTHORIZED") {
    throw new Error("OAuth code exchange did not complete");
  }
}
