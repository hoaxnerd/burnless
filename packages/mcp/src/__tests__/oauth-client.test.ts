import { describe, it, expect, vi } from "vitest";
import { createDbBackedProvider, beginOAuth, completeOAuth, type OAuthPersistence } from "../oauth-client";

function memPersistence(): OAuthPersistence & { store: Record<string, unknown> } {
  const store: Record<string, unknown> = {};
  return {
    store,
    loadClientInfo: vi.fn(async () => store.clientInfo as never),
    saveClientInfo: vi.fn(async (info) => void (store.clientInfo = info)),
    loadTokens: vi.fn(async () => store.tokens as never),
    saveTokens: vi.fn(async (tokens) => void (store.tokens = tokens)),
    loadCodeVerifier: vi.fn(async () => store.verifier as string),
    saveCodeVerifier: vi.fn(async (v) => void (store.verifier = v)),
  };
}

describe("oauth client", () => {
  it("beginOAuth returns the captured authorization URL when auth redirects", async () => {
    const p = memPersistence();
    const provider = createDbBackedProvider({
      serverUrl: "https://mcp.example.com",
      redirectUrl: "https://app.example.com/api/mcp/oauth/callback",
      persistence: p,
    });
    const authFn = vi.fn(async (prov: { redirectToAuthorization(u: URL): void | Promise<void> }) => {
      await prov.redirectToAuthorization(new URL("https://as.example.com/authorize?code_challenge=x"));
      return "REDIRECT" as const;
    });
    const url = await beginOAuth(provider, "https://mcp.example.com", authFn as never);
    expect(url.href).toContain("https://as.example.com/authorize");
  });

  it("beginOAuth throws if auth completes without redirecting (already authorized)", async () => {
    const provider = createDbBackedProvider({
      serverUrl: "https://mcp.example.com",
      redirectUrl: "https://app.example.com/cb",
      persistence: memPersistence(),
    });
    const authFn = vi.fn(async () => "AUTHORIZED" as const);
    await expect(beginOAuth(provider, "https://mcp.example.com", authFn as never)).rejects.toThrow(/already authorized/i);
  });

  it("completeOAuth passes the code through and resolves on AUTHORIZED", async () => {
    const provider = createDbBackedProvider({
      serverUrl: "https://mcp.example.com",
      redirectUrl: "https://app.example.com/cb",
      persistence: memPersistence(),
    });
    const authFn = vi.fn(async (_p: unknown, opts: { authorizationCode?: string }) => {
      expect(opts.authorizationCode).toBe("the-code");
      return "AUTHORIZED" as const;
    });
    await expect(completeOAuth(provider, "https://mcp.example.com", "the-code", authFn as never)).resolves.toBeUndefined();
  });

  it("provider delegates persistence to the injected callbacks", async () => {
    const p = memPersistence();
    const provider = createDbBackedProvider({
      serverUrl: "https://s", redirectUrl: "https://cb", persistence: p,
    });
    await provider.saveCodeVerifier("ver123");
    expect(await provider.codeVerifier()).toBe("ver123");
    await provider.saveTokens({ access_token: "at", token_type: "Bearer" } as never);
    expect(p.store.tokens).toMatchObject({ access_token: "at" });
    expect(provider.redirectUrl).toBe("https://cb");
    expect(provider.clientMetadata.redirect_uris).toEqual(["https://cb"]);
  });
});
