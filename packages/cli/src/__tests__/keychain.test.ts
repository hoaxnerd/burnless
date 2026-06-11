import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKeychain, type ExecFn } from "../keychain";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-cli-keychain-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const brokenExec: ExecFn = async () => {
  throw new Error("ENOENT: binary not installed");
};

describe("keychain encrypted-file fallback", () => {
  it("set/get/delete round-trip via the fallback when the native binary is missing", async () => {
    const keychain = createKeychain({ platform: "darwin", exec: brokenExec, homeDir: home });
    expect(await keychain.get("local")).toBeNull();
    await keychain.set("local", "bl_pat_supersecret");
    expect(await keychain.get("local")).toBe("bl_pat_supersecret");
    await keychain.delete("local");
    expect(await keychain.get("local")).toBeNull();
  });

  it("ciphertext on disk never contains the plaintext secret", async () => {
    const keychain = createKeychain({ platform: "linux", exec: brokenExec, homeDir: home });
    await keychain.set("local", "bl_pat_supersecret");
    const file = join(home, ".burnless", "credentials.enc");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).not.toContain("bl_pat_supersecret");
  });

  it("a fresh keychain instance (same machine identity) can decrypt", async () => {
    const first = createKeychain({ platform: "win32", homeDir: home });
    await first.set("cloud", "bl_pat_other");
    const second = createKeychain({ platform: "win32", homeDir: home });
    expect(await second.get("cloud")).toBe("bl_pat_other");
  });

  it("win32 uses the file directly without trying to exec anything", async () => {
    let execCalled = false;
    const spyExec: ExecFn = async () => {
      execCalled = true;
      return "";
    };
    const keychain = createKeychain({ platform: "win32", exec: spyExec, homeDir: home });
    await keychain.set("local", "x");
    expect(await keychain.get("local")).toBe("x");
    expect(execCalled).toBe(false);
  });

  it("prefers the native store when it works", async () => {
    const store = new Map<string, string>();
    const fakeSecurity: ExecFn = async (_cmd, args) => {
      // crude emulation of macOS `security` semantics
      if (args[0] === "add-generic-password") {
        const service = args[args.indexOf("-s") + 1] ?? "";
        const secret = args[args.indexOf("-w") + 1] ?? "";
        store.set(service, secret);
        return "";
      }
      if (args[0] === "find-generic-password") {
        const service = args[args.indexOf("-s") + 1] ?? "";
        const found = store.get(service);
        if (found === undefined) throw new Error("not found");
        return found + "\n";
      }
      if (args[0] === "delete-generic-password") {
        const service = args[args.indexOf("-s") + 1] ?? "";
        store.delete(service);
        return "";
      }
      throw new Error("unexpected call");
    };
    const keychain = createKeychain({ platform: "darwin", exec: fakeSecurity, homeDir: home });
    await keychain.set("local", "bl_pat_native");
    expect(store.get("burnless:local")).toBe("bl_pat_native");
    expect(await keychain.get("local")).toBe("bl_pat_native");
    // nothing should have hit the fallback file
    expect(existsSync(join(home, ".burnless", "credentials.enc"))).toBe(false);
  });
});
