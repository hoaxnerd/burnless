import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteCredential, loadCredential, saveCredential } from "../credentials";
import { createKeychain, type Keychain } from "../keychain";

let home: string;
let keychain: Keychain;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-cli-creds-"));
  keychain = createKeychain({ platform: "win32", homeDir: home }); // pure file backend
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("stored credentials", () => {
  it("round-trips a PAT credential", async () => {
    await saveCredential(keychain, "local", { kind: "pat", token: "bl_pat_abc" });
    expect(await loadCredential(keychain, "local")).toEqual({ kind: "pat", token: "bl_pat_abc" });
  });

  it("round-trips an OAuth credential with tokens", async () => {
    await saveCredential(keychain, "cloud", {
      kind: "oauth",
      tokens: { access_token: "bl_at_x", token_type: "Bearer", expires_in: 3600, refresh_token: "bl_rt_x" },
      obtainedAt: 1750000000000,
    });
    const loaded = await loadCredential(keychain, "cloud");
    expect(loaded?.kind).toBe("oauth");
    if (loaded?.kind === "oauth") expect(loaded.tokens?.access_token).toBe("bl_at_x");
  });

  it("returns null for a missing or unparseable credential", async () => {
    expect(await loadCredential(keychain, "nope")).toBeNull();
    await keychain.set("garbage", "not json");
    expect(await loadCredential(keychain, "garbage")).toBeNull();
  });

  it("deleteCredential removes the entry", async () => {
    await saveCredential(keychain, "local", { kind: "pat", token: "bl_pat_abc" });
    await deleteCredential(keychain, "local");
    expect(await loadCredential(keychain, "local")).toBeNull();
  });
});
