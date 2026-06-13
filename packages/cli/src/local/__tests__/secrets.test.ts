import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { instanceEnvPath, readInstanceEnv } from "../home";
import { ensureAuthSecret, ensureSecretsKey } from "../secrets";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-secrets-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("ensureSecretsKey", () => {
  it("returns process env value without writing", () => {
    const env: NodeJS.ProcessEnv = { SECRETS_ENCRYPTION_KEY: "from-env" };
    expect(ensureSecretsKey({ home, env })).toBe("from-env");
    expect(readInstanceEnv(home).SECRETS_ENCRYPTION_KEY).toBeUndefined();
  });

  it("returns the persisted instance.env value and exports it", () => {
    const env: NodeJS.ProcessEnv = {};
    const first = ensureSecretsKey({ home, env });
    const env2: NodeJS.ProcessEnv = {};
    expect(ensureSecretsKey({ home, env: env2 })).toBe(first);
    expect(env2.SECRETS_ENCRYPTION_KEY).toBe(first);
  });

  it("generates + persists 0600 + exports when absent; idempotent", () => {
    const env: NodeJS.ProcessEnv = {};
    const key = ensureSecretsKey({ home, env });
    expect(key).toBeTruthy();
    expect(env.SECRETS_ENCRYPTION_KEY).toBe(key);
    expect(readInstanceEnv(home).SECRETS_ENCRYPTION_KEY).toBe(key);
    const mode = statSync(instanceEnvPath(home)).mode & 0o777;
    expect(mode).toBe(0o600);
    // idempotent: second call returns the same value
    const env2: NodeJS.ProcessEnv = {};
    expect(ensureSecretsKey({ home, env: env2 })).toBe(key);
  });
});

describe("ensureAuthSecret", () => {
  it("returns process env value without writing", () => {
    const env: NodeJS.ProcessEnv = { AUTH_SECRET: "from-env" };
    expect(ensureAuthSecret({ home, env })).toBe("from-env");
    expect(readInstanceEnv(home).AUTH_SECRET).toBeUndefined();
  });

  it("returns the persisted instance.env value and exports it", () => {
    const env: NodeJS.ProcessEnv = {};
    const first = ensureAuthSecret({ home, env });
    const env2: NodeJS.ProcessEnv = {};
    expect(ensureAuthSecret({ home, env: env2 })).toBe(first);
    expect(env2.AUTH_SECRET).toBe(first);
  });

  it("generates + persists 0600 + exports when absent; idempotent", () => {
    const env: NodeJS.ProcessEnv = {};
    const secret = ensureAuthSecret({ home, env });
    expect(secret).toBeTruthy();
    expect(env.AUTH_SECRET).toBe(secret);
    expect(readInstanceEnv(home).AUTH_SECRET).toBe(secret);
    const mode = statSync(instanceEnvPath(home)).mode & 0o777;
    expect(mode).toBe(0o600);
    const env2: NodeJS.ProcessEnv = {};
    expect(ensureAuthSecret({ home, env: env2 })).toBe(secret);
  });

  it("persists alongside SECRETS_ENCRYPTION_KEY without clobbering it", () => {
    const env: NodeJS.ProcessEnv = {};
    const encKey = ensureSecretsKey({ home, env });
    const authSecret = ensureAuthSecret({ home, env });
    const persisted = readInstanceEnv(home);
    expect(persisted.SECRETS_ENCRYPTION_KEY).toBe(encKey);
    expect(persisted.AUTH_SECRET).toBe(authSecret);
    // distinct random values
    expect(authSecret).not.toBe(encKey);
    // file body holds both keys
    const body = readFileSync(instanceEnvPath(home), "utf8");
    expect(body).toContain("SECRETS_ENCRYPTION_KEY=");
    expect(body).toContain("AUTH_SECRET=");
  });
});
