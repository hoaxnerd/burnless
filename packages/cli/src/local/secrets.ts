/**
 * First-run secret bootstrap (spec §4). Precedence: process env → persisted instance.env →
 * generate (32 random bytes, base64) + persist. Idempotent. After resolving, the value is
 * exported into the passed env so a subsequently-spawned server inherits it (the launcher
 * and the server share one env).
 * - SECRETS_ENCRYPTION_KEY: encrypts external-MCP connection credentials at rest.
 * - AUTH_SECRET: NextAuth JWT signing — a self-host server can't boot a working session layer
 *   without it (auto-login + the browser E2E depend on it), so first-run provisions it too.
 */
import { randomBytes } from "node:crypto";
import { readInstanceEnv, setInstanceEnvVar } from "./home";

export interface EnsureKeyOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
}

/** Resolve-or-generate one named secret with the shared precedence + persist + export. */
function ensureSecret(name: string, opts: EnsureKeyOptions): string {
  const env = opts.env ?? process.env;
  const fromEnv = env[name]?.trim();
  if (fromEnv) return fromEnv;

  const persisted = readInstanceEnv(opts.home)[name];
  if (persisted) {
    env[name] = persisted;
    return persisted;
  }

  const value = randomBytes(32).toString("base64");
  setInstanceEnvVar(name, value, opts.home);
  env[name] = value;
  return value;
}

export function ensureSecretsKey(opts: EnsureKeyOptions = {}): string {
  return ensureSecret("SECRETS_ENCRYPTION_KEY", opts);
}

export function ensureAuthSecret(opts: EnsureKeyOptions = {}): string {
  return ensureSecret("AUTH_SECRET", opts);
}
