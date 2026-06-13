/**
 * SECRETS_ENCRYPTION_KEY bootstrap (spec §4 first-run). Precedence: process env →
 * persisted instance.env → generate (32 random bytes, base64) + persist. Idempotent.
 * After resolving, the key is exported into the passed env so a subsequently-spawned
 * server inherits it (the launcher and the server share one env).
 */
import { randomBytes } from "node:crypto";
import { readInstanceEnv, setInstanceEnvVar } from "./home";

export interface EnsureKeyOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
}

export function ensureSecretsKey(opts: EnsureKeyOptions = {}): string {
  const env = opts.env ?? process.env;
  const fromEnv = env.SECRETS_ENCRYPTION_KEY?.trim();
  if (fromEnv) return fromEnv;

  const persisted = readInstanceEnv(opts.home).SECRETS_ENCRYPTION_KEY;
  if (persisted) {
    env.SECRETS_ENCRYPTION_KEY = persisted;
    return persisted;
  }

  const key = randomBytes(32).toString("base64");
  setInstanceEnvVar("SECRETS_ENCRYPTION_KEY", key, opts.home);
  env.SECRETS_ENCRYPTION_KEY = key;
  return key;
}
