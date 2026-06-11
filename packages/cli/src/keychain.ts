/**
 * Credential storage (spec §7.2): OS keychain preferred, encrypted-file fallback.
 *
 *   macOS  → `security add/find/delete-generic-password` (login keychain)
 *   Linux  → `secret-tool store/lookup/clear` (libsecret)
 *   win32 / headless / missing binaries → ~/.burnless/credentials.enc
 *
 * THREAT MODEL of the file fallback (stated honestly): AES-256-GCM with a key
 * scrypt-derived from `os.hostname() + os.userInfo().username`. Both inputs are
 * readable by any local process running as you, so this is LOCAL-USER-GRADE
 * protection only — it prevents casual disclosure (accidental `cat`, backup-tool
 * scraping, secrets sitting in plain sight in dotfiles) but NOT a determined
 * attacker who can already execute code as your user. The OS keychain is strictly
 * stronger; the fallback exists for headless boxes and Windows (cmdkey cannot
 * store arbitrary retrievable secrets, so win32 always uses the file).
 */
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { configDir } from "./config";

export interface Keychain {
  get(profile: string): Promise<string | null>;
  set(profile: string, secret: string): Promise<void>;
  delete(profile: string): Promise<void>;
}

export type ExecFn = (command: string, args: string[], stdinData?: string) => Promise<string>;

export const defaultExec: ExecFn = (command, args, stdinData) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject); // e.g. ENOENT — binary not installed
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
    });
    if (stdinData !== undefined) child.stdin.write(stdinData);
    child.stdin.end();
  });

export interface KeychainOptions {
  platform?: NodeJS.Platform;
  exec?: ExecFn;
  homeDir?: string;
}

const SERVICE_PREFIX = "burnless:";
const FALLBACK_FILE = "credentials.enc";
const SCRYPT_SALT = "burnless-cli-credentials-v1";

function deriveKey(): Buffer {
  return scryptSync(os.hostname() + os.userInfo().username, SCRYPT_SALT, 32);
}

function fallbackPath(homeDir?: string): string {
  return join(configDir(homeDir), FALLBACK_FILE);
}

function readFallback(homeDir?: string): Record<string, string> {
  const path = fallbackPath(homeDir);
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8")) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(raw.iv, "base64"));
  decipher.setAuthTag(Buffer.from(raw.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(raw.data, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as Record<string, string>;
}

function writeFallback(entries: Record<string, string>, homeDir?: string): void {
  mkdirSync(configDir(homeDir), { recursive: true, mode: 0o700 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(entries), "utf8"), cipher.final()]);
  const payload = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
  writeFileSync(fallbackPath(homeDir), JSON.stringify(payload), { mode: 0o600 });
}

export function createKeychain(options: KeychainOptions = {}): Keychain {
  const platform = options.platform ?? process.platform;
  const exec = options.exec ?? defaultExec;
  const account = os.userInfo().username;

  const file: Keychain = {
    async get(profile) {
      return readFallback(options.homeDir)[profile] ?? null;
    },
    async set(profile, secret) {
      const entries = readFallback(options.homeDir);
      entries[profile] = secret;
      writeFallback(entries, options.homeDir);
    },
    async delete(profile) {
      const entries = readFallback(options.homeDir);
      delete entries[profile];
      writeFallback(entries, options.homeDir);
    },
  };

  let native: Keychain | null = null;
  if (platform === "darwin") {
    native = {
      async get(profile) {
        try {
          const out = await exec("security", [
            "find-generic-password",
            "-a",
            account,
            "-s",
            SERVICE_PREFIX + profile,
            "-w",
          ]);
          return out.trim() === "" ? null : out.trim();
        } catch {
          return null;
        }
      },
      async set(profile, secret) {
        // -U updates in place if the item already exists
        await exec("security", [
          "add-generic-password",
          "-U",
          "-a",
          account,
          "-s",
          SERVICE_PREFIX + profile,
          "-w",
          secret,
        ]);
      },
      async delete(profile) {
        await exec("security", ["delete-generic-password", "-a", account, "-s", SERVICE_PREFIX + profile]);
      },
    };
  } else if (platform === "linux") {
    native = {
      async get(profile) {
        try {
          const out = await exec("secret-tool", ["lookup", "service", "burnless", "profile", profile]);
          return out.trim() === "" ? null : out.trim();
        } catch {
          return null;
        }
      },
      async set(profile, secret) {
        // secret-tool reads the secret from stdin
        await exec(
          "secret-tool",
          ["store", "--label", SERVICE_PREFIX + profile, "service", "burnless", "profile", profile],
          secret
        );
      },
      async delete(profile) {
        await exec("secret-tool", ["clear", "service", "burnless", "profile", profile]);
      },
    };
  }
  // win32 / anything else → file only.

  if (native === null) return file;
  const nativeStore = native;

  return {
    async get(profile) {
      const fromNative = await nativeStore.get(profile);
      if (fromNative !== null) return fromNative;
      return file.get(profile);
    },
    async set(profile, secret) {
      try {
        await nativeStore.set(profile, secret);
      } catch {
        await file.set(profile, secret); // native unavailable → encrypted file
      }
    },
    async delete(profile) {
      try {
        await nativeStore.delete(profile);
      } catch {
        /* not in the native store (or no native store) — fine */
      }
      try {
        await file.delete(profile);
      } catch {
        /* no fallback file — fine */
      }
    },
  };
}
