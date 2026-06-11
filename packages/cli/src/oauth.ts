/**
 * OAuth 2.1 login for the CLI (spec §7.3, server side per §5.2):
 * localhost callback (random port) → SDK auth() does PRM/AS discovery,
 * RFC 7591 DCR, PKCE S256, and the RFC 8707 `resource` parameter → consent in
 * the browser → code exchange → tokens persisted to the keychain.
 *
 * The provider mirrors packages/mcp/src/oauth-client.ts's CapturingProvider
 * (capture the redirect URL; injectable authFn for unit tests) but persists via
 * the keychain credential codec — self-contained here because the published
 * package cannot import private workspace code.
 *
 * Verified against @modelcontextprotocol/sdk 1.29.0: auth() consumes
 * provider.state() when building the authorization URL (client/auth.js:299),
 * and with stored tokens carrying a refresh_token it runs the refresh grant
 * and persists rotated tokens through provider.saveTokens().
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import http from "node:http";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { loadCredential, saveCredential, type StoredOAuth } from "./credentials";
import { CliError } from "./errors";
import type { Keychain } from "./keychain";
import { mcpUrlOf } from "./mcp-session";

export type AuthResult = "AUTHORIZED" | "REDIRECT";
export type AuthFn = (
  provider: OAuthClientProvider,
  options: { serverUrl: string | URL; authorizationCode?: string }
) => Promise<AuthResult>;

const defaultAuthFn: AuthFn = auth as unknown as AuthFn;

export class KeychainOAuthProvider implements OAuthClientProvider {
  capturedAuthorizationUrl: URL | null = null;
  private readonly stateValue = randomBytes(16).toString("hex");

  constructor(
    private readonly keychain: Keychain,
    private readonly profileName: string,
    private readonly redirect: string
  ) {}

  private async load(): Promise<StoredOAuth> {
    const cred = await loadCredential(this.keychain, this.profileName);
    return cred !== null && cred.kind === "oauth" ? cred : { kind: "oauth" };
  }

  private async patch(patch: Partial<StoredOAuth>): Promise<void> {
    const current = await this.load();
    await saveCredential(this.keychain, this.profileName, { ...current, ...patch, kind: "oauth" });
  }

  get redirectUrl(): string {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "burnless-cli",
      redirect_uris: [this.redirect],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // public client + PKCE only (spec §5.2)
    };
  }

  state(): string {
    return this.stateValue;
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return (await this.load()).clientInfo;
  }

  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    await this.patch({ clientInfo: info });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.load()).tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.patch({ tokens, obtainedAt: Date.now() });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.capturedAuthorizationUrl = authorizationUrl;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await this.patch({ codeVerifier: verifier });
  }

  async codeVerifier(): Promise<string> {
    const verifier = (await this.load()).codeVerifier;
    if (verifier === undefined) {
      throw new CliError("No PKCE code verifier stored — restart `burnless login --oauth`.");
    }
    return verifier;
  }
}

export interface CallbackServer {
  port: number;
  waitForCode(expectedState: string): Promise<string>;
  close(): void;
}

/** Loopback redirect receiver — binds 127.0.0.1 on a random port (spec §7.3). */
export function startCallbackServer(): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let settle: { resolve: (code: string) => void; reject: (err: Error) => void } | null = null;
    let expected = "";
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (code === null || state !== expected) {
        res.writeHead(400, { "content-type": "text/plain" }).end("Invalid OAuth callback (state mismatch).");
        settle?.reject(new CliError("OAuth callback state mismatch — aborting login."));
        return;
      }
      res
        .writeHead(200, { "content-type": "text/html" })
        .end("<p>Logged in to Burnless. You can close this tab and return to the terminal.</p>");
      settle?.resolve(code);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new CliError("Could not bind the OAuth callback server."));
        return;
      }
      resolve({
        port: address.port,
        waitForCode: (expectedState) =>
          new Promise<string>((resolveCode, rejectCode) => {
            expected = expectedState;
            settle = { resolve: resolveCode, reject: rejectCode };
          }),
        close: () => server.close(),
      });
    });
  });
}

function defaultOpenBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(command, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* user copies the printed URL instead */
  }
}

export interface LoginOAuthOptions {
  baseUrl: string;
  profileName: string;
  keychain: Keychain;
  authFn?: AuthFn;
  openBrowser?: (url: string) => void;
  callbackServer?: CallbackServer; // injected in tests
  log?: (line: string) => void; // defaults to stderr — stdout stays machine-clean
}

export async function loginOAuth(opts: LoginOAuthOptions): Promise<void> {
  const authFn = opts.authFn ?? defaultAuthFn;
  const log = opts.log ?? ((line: string) => process.stderr.write(line + "\n"));
  const server = opts.callbackServer ?? (await startCallbackServer());
  try {
    const provider = new KeychainOAuthProvider(
      opts.keychain,
      opts.profileName,
      `http://127.0.0.1:${server.port}/callback`
    );
    const serverUrl = mcpUrlOf(opts.baseUrl);
    const first = await authFn(provider, { serverUrl });
    if (first === "AUTHORIZED") {
      log("Already authorized — credentials refreshed.");
      return;
    }
    const authorizationUrl = provider.capturedAuthorizationUrl;
    if (authorizationUrl === null) {
      throw new CliError("OAuth flow requested a redirect but no authorization URL was captured.");
    }
    log("Open this URL in your browser to authorize the burnless CLI:");
    log("  " + authorizationUrl.toString());
    (opts.openBrowser ?? defaultOpenBrowser)(authorizationUrl.toString());
    const code = await server.waitForCode(provider.state());
    const second = await authFn(provider, { serverUrl, authorizationCode: code });
    if (second !== "AUTHORIZED") {
      throw new CliError("OAuth code exchange did not complete.");
    }
    log("Logged in with OAuth. Tokens stored in your keychain.");
  } finally {
    server.close();
  }
}

const EXPIRY_SKEW_MS = 60_000;

export interface ResolveTokenOptions {
  baseUrl: string;
  profileName: string;
  keychain: Keychain;
  authFn?: AuthFn;
}

/**
 * The one function commands use to obtain a bearer token.
 * PAT → returned as-is. OAuth → proactive refresh when within 60s of expiry
 * (the SDK refresh grant rotates tokens; spec §5.2 rotation + reuse detection
 * are server-side concerns — we just always persist the newest pair).
 */
export async function resolveToken(opts: ResolveTokenOptions): Promise<string> {
  const cred = await loadCredential(opts.keychain, opts.profileName);
  if (cred === null) {
    throw new CliError(`No credentials stored for profile "${opts.profileName}". Run \`burnless login\` first.`, 2);
  }
  if (cred.kind === "pat") return cred.token;
  if (cred.tokens?.access_token === undefined) {
    throw new CliError(
      `Profile "${opts.profileName}" has an incomplete OAuth login. Run \`burnless login --oauth\` again.`,
      2
    );
  }
  const expiresAtMs =
    cred.obtainedAt !== undefined && cred.tokens.expires_in !== undefined
      ? cred.obtainedAt + cred.tokens.expires_in * 1000
      : undefined;
  const expired = expiresAtMs !== undefined && expiresAtMs - EXPIRY_SKEW_MS <= Date.now();
  if (!expired) return cred.tokens.access_token;
  if (cred.tokens.refresh_token === undefined) {
    throw new CliError("OAuth access token expired and no refresh token is stored. Run `burnless login --oauth`.", 2);
  }
  const authFn = opts.authFn ?? defaultAuthFn;
  // Redirect URL is unused during a refresh grant but required by the provider shape.
  const provider = new KeychainOAuthProvider(opts.keychain, opts.profileName, "http://127.0.0.1/callback-unused");
  const result = await authFn(provider, { serverUrl: mcpUrlOf(opts.baseUrl) });
  if (result !== "AUTHORIZED") {
    throw new CliError("OAuth token refresh required interactive re-authorization. Run `burnless login --oauth`.", 2);
  }
  const refreshed = await loadCredential(opts.keychain, opts.profileName);
  if (refreshed === null || refreshed.kind !== "oauth" || refreshed.tokens?.access_token === undefined) {
    throw new CliError("OAuth token refresh did not persist tokens — try `burnless login --oauth` again.");
  }
  return refreshed.tokens.access_token;
}
