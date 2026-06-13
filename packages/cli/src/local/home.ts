/**
 * Launcher data home = ~/.burnless (reuses the CLI configDir). The launcher's env-style
 * file `instance.env` is SEPARATE from the CLI profile store `config.json` and from the
 * PGLite data dir — it holds boot env (SECRETS_ENCRYPTION_KEY, BURNLESS_CAP_*, port).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "../config";

export function instanceEnvPath(home?: string): string {
  return join(configDir(home), "instance.env");
}

/** Parse the dotenv-ish instance.env (KEY=VALUE per line; # comments; no quoting). */
export function readInstanceEnv(home?: string): Record<string, string> {
  const path = instanceEnvPath(home);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

/** Upsert one KEY=VALUE, preserving other entries. Writes 0600. */
export function setInstanceEnvVar(key: string, value: string, home?: string): void {
  const current = readInstanceEnv(home);
  current[key] = value;
  const body = Object.entries(current)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  mkdirSync(configDir(home), { recursive: true, mode: 0o700 });
  writeFileSync(instanceEnvPath(home), body + "\n", { mode: 0o600 });
}

/** Source instance.env into an env object (process.env by default). Explicit env wins. */
export function loadInstanceEnv(opts: { home?: string; env?: NodeJS.ProcessEnv } = {}): void {
  const env = opts.env ?? process.env;
  for (const [k, v] of Object.entries(readInstanceEnv(opts.home))) {
    if (env[k] === undefined) env[k] = v;
  }
}
