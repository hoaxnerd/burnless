import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { performPatLogin } from "../commands/login";
import { loadCredential } from "../credentials";
import { createKeychain, type Keychain } from "../keychain";
import { makeFakeSession } from "./helpers/fake-session";

let home: string;
let keychain: Keychain;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-cli-login-"));
  keychain = createKeychain({ platform: "win32", homeDir: home });
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("performPatLogin (spec §8: PAT login vs mock server)", () => {
  it("verifies the token by listing tools, then stores the credential", async () => {
    const { session, log } = makeFakeSession();
    const toolCount = await performPatLogin(
      { baseUrl: "http://localhost:3000", profileName: "local", token: "bl_pat_abc123" },
      { keychain, sessionFactory: async () => session }
    );
    expect(toolCount).toBe(2);
    expect(log.closed).toBe(true);
    expect(await loadCredential(keychain, "local")).toEqual({ kind: "pat", token: "bl_pat_abc123" });
  });

  it("rejects tokens without the bl_pat_ prefix with exit 2 and stores nothing", async () => {
    const { session } = makeFakeSession();
    await expect(
      performPatLogin(
        { baseUrl: "http://localhost:3000", profileName: "local", token: "sk-not-a-pat" },
        { keychain, sessionFactory: async () => session }
      )
    ).rejects.toMatchObject({ exitCode: 2 });
    expect(await loadCredential(keychain, "local")).toBeNull();
  });

  it("does not store the credential when the session cannot list tools", async () => {
    const { session } = makeFakeSession({
      async listTools() {
        throw new Error("401 Unauthorized");
      },
    });
    await expect(
      performPatLogin(
        { baseUrl: "http://localhost:3000", profileName: "local", token: "bl_pat_revoked" },
        { keychain, sessionFactory: async () => session }
      )
    ).rejects.toThrow("401");
    expect(await loadCredential(keychain, "local")).toBeNull();
  });
});
