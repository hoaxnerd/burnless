import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCredential, saveCredential } from "../credentials";
import { CliError } from "../errors";
import { createKeychain, type Keychain } from "../keychain";
import {
  KeychainOAuthProvider,
  loginOAuth,
  resolveToken,
  type AuthFn,
  type CallbackServer,
} from "../oauth";

let home: string;
let keychain: Keychain;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-cli-oauth-"));
  keychain = createKeychain({ platform: "win32", homeDir: home }); // pure file backend
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("loginOAuth (injected fake authFn — same pattern as packages/mcp/src/oauth-client.ts)", () => {
  it("redirect → callback code → exchange → tokens in keychain", async () => {
    const seenStates: string[] = [];
    const fakeAuthFn: AuthFn = async (provider, options) => {
      expect(String(options.serverUrl)).toBe("http://localhost:3000/mcp");
      if (options.authorizationCode === undefined) {
        const state = await (provider as KeychainOAuthProvider).state();
        await provider.saveCodeVerifier("test-verifier");
        await provider.redirectToAuthorization(
          new URL(`http://localhost:3000/oauth/authorize?client_id=c1&state=${state}`)
        );
        return "REDIRECT";
      }
      expect(options.authorizationCode).toBe("test-code");
      expect(await provider.codeVerifier()).toBe("test-verifier");
      await provider.saveTokens({
        access_token: "bl_at_fresh",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "bl_rt_fresh",
      });
      return "AUTHORIZED";
    };
    const fakeCallback: CallbackServer = {
      port: 49152,
      waitForCode: async (expectedState) => {
        seenStates.push(expectedState);
        return "test-code";
      },
      close: () => {},
    };

    await loginOAuth({
      baseUrl: "http://localhost:3000",
      profileName: "local",
      keychain,
      authFn: fakeAuthFn,
      callbackServer: fakeCallback,
      openBrowser: () => {},
      log: () => {},
    });

    expect(seenStates).toHaveLength(1);
    expect(seenStates[0]).toMatch(/^[0-9a-f]{32}$/);
    const cred = await loadCredential(keychain, "local");
    expect(cred?.kind).toBe("oauth");
    if (cred?.kind === "oauth") {
      expect(cred.tokens?.access_token).toBe("bl_at_fresh");
      expect(cred.tokens?.refresh_token).toBe("bl_rt_fresh");
    }
  });

  it("fails loudly when the exchange does not authorize", async () => {
    const fakeAuthFn: AuthFn = async (provider, options) => {
      if (options.authorizationCode === undefined) {
        await provider.redirectToAuthorization(new URL("http://localhost:3000/oauth/authorize?state=x"));
        return "REDIRECT";
      }
      return "REDIRECT"; // exchange did not complete
    };
    await expect(
      loginOAuth({
        baseUrl: "http://localhost:3000",
        profileName: "local",
        keychain,
        authFn: fakeAuthFn,
        callbackServer: { port: 1, waitForCode: async () => "code", close: () => {} },
        openBrowser: () => {},
        log: () => {},
      })
    ).rejects.toThrow(CliError);
  });
});

describe("resolveToken", () => {
  it("returns a stored PAT directly", async () => {
    await saveCredential(keychain, "local", { kind: "pat", token: "bl_pat_direct" });
    const token = await resolveToken({ baseUrl: "http://localhost:3000", profileName: "local", keychain });
    expect(token).toBe("bl_pat_direct");
  });

  it("returns a fresh OAuth access token without refreshing", async () => {
    await saveCredential(keychain, "local", {
      kind: "oauth",
      tokens: { access_token: "bl_at_live", token_type: "Bearer", expires_in: 3600, refresh_token: "bl_rt_live" },
      obtainedAt: Date.now(),
    });
    const token = await resolveToken({ baseUrl: "http://localhost:3000", profileName: "local", keychain });
    expect(token).toBe("bl_at_live");
  });

  it("refreshes an expired OAuth token via authFn (rotation handled by saveTokens)", async () => {
    await saveCredential(keychain, "local", {
      kind: "oauth",
      tokens: { access_token: "bl_at_stale", token_type: "Bearer", expires_in: 3600, refresh_token: "bl_rt_stale" },
      obtainedAt: Date.now() - 7_200_000, // expired two hours ago
    });
    const refreshFn: AuthFn = async (provider, options) => {
      expect(options.authorizationCode).toBeUndefined();
      await provider.saveTokens({
        access_token: "bl_at_rotated",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "bl_rt_rotated",
      });
      return "AUTHORIZED";
    };
    const token = await resolveToken({
      baseUrl: "http://localhost:3000",
      profileName: "local",
      keychain,
      authFn: refreshFn,
    });
    expect(token).toBe("bl_at_rotated");
  });

  it("throws exit-2 CliError when nothing is stored", async () => {
    await expect(
      resolveToken({ baseUrl: "http://localhost:3000", profileName: "ghost", keychain })
    ).rejects.toMatchObject({ exitCode: 2 });
  });
});
