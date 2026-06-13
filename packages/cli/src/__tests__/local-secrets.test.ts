import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSecretsKey } from "../local/secrets";
import { readInstanceEnv } from "../local/home";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(os.tmpdir(), "bl-home-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.SECRETS_ENCRYPTION_KEY;
});

describe("ensureSecretsKey", () => {
  it("returns the env key without writing a file when SECRETS_ENCRYPTION_KEY is set", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyMzI="; // 32 bytes b64
    const key = ensureSecretsKey({ home, env: process.env });
    expect(key).toBe(process.env.SECRETS_ENCRYPTION_KEY);
    expect(readInstanceEnv(home).SECRETS_ENCRYPTION_KEY).toBeUndefined();
  });

  it("generates, persists (0600), and returns a 32-byte base64 key when absent", () => {
    const key = ensureSecretsKey({ home, env: {} });
    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(readInstanceEnv(home).SECRETS_ENCRYPTION_KEY).toBe(key);
    const fileContent = readFileSync(join(home, ".burnless", "instance.env"), "utf8");
    expect(fileContent).toContain("SECRETS_ENCRYPTION_KEY=");
  });

  it("is idempotent — a second call returns the persisted key, not a new one", () => {
    const first = ensureSecretsKey({ home, env: {} });
    const second = ensureSecretsKey({ home, env: {} });
    expect(second).toBe(first);
  });
});
