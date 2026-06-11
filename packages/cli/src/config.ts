/**
 * Profile store — ~/.burnless/config.json (spec §7.2).
 * SECRETS NEVER LIVE IN THIS FILE: saveConfig whitelists exactly
 * { baseUrl, authMode, defaultCompany } per profile. Credentials go through
 * src/keychain.ts instead.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { UsageError } from "./errors";

export interface Profile {
  baseUrl: string;
  authMode: "pat" | "oauth";
  defaultCompany?: string;
}

export interface CliConfig {
  defaultProfile: string;
  profiles: Record<string, Profile>;
}

/** First run targets a fresh self-host (spec §7.2 + §2 release model). */
export const DEFAULT_CONFIG: CliConfig = {
  defaultProfile: "local",
  profiles: { local: { baseUrl: "http://localhost:3000", authMode: "pat" } },
};

export function configDir(homeDir?: string): string {
  if (homeDir !== undefined) return join(homeDir, ".burnless");
  if (process.env.BURNLESS_CONFIG_DIR !== undefined) return process.env.BURNLESS_CONFIG_DIR;
  return join(os.homedir(), ".burnless");
}

export function configPath(homeDir?: string): string {
  return join(configDir(homeDir), "config.json");
}

export function loadConfig(homeDir?: string): CliConfig {
  const path = configPath(homeDir);
  if (!existsSync(path)) return structuredClone(DEFAULT_CONFIG);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new UsageError(`Corrupt config at ${path} — fix or delete it and log in again.`);
  }
  const candidate = parsed as Partial<CliConfig>;
  if (
    typeof candidate.defaultProfile !== "string" ||
    candidate.profiles === null ||
    typeof candidate.profiles !== "object"
  ) {
    throw new UsageError(`Invalid config at ${path} — expected { defaultProfile, profiles }.`);
  }
  return {
    defaultProfile: candidate.defaultProfile,
    profiles: candidate.profiles as Record<string, Profile>,
  };
}

export function saveConfig(config: CliConfig, homeDir?: string): void {
  // Whitelist serialization — even a polluted in-memory object cannot leak
  // a secret to disk (spec §7.2; regression-tested).
  const clean: CliConfig = {
    defaultProfile: config.defaultProfile,
    profiles: Object.fromEntries(
      Object.entries(config.profiles).map(([name, profile]) => [
        name,
        {
          baseUrl: profile.baseUrl,
          authMode: profile.authMode,
          ...(profile.defaultCompany !== undefined ? { defaultCompany: profile.defaultCompany } : {}),
        },
      ])
    ),
  };
  mkdirSync(configDir(homeDir), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(homeDir), JSON.stringify(clean, null, 2) + "\n", { mode: 0o600 });
}

/** Precedence: --profile flag > BURNLESS_PROFILE env > defaultProfile (spec §7.2). */
export function resolveProfileName(
  config: CliConfig,
  flagProfile?: string,
  env: Record<string, string | undefined> = process.env
): string {
  return flagProfile ?? env.BURNLESS_PROFILE ?? config.defaultProfile;
}

export function getProfile(config: CliConfig, name: string): Profile {
  const profile = config.profiles[name];
  if (!profile) {
    throw new UsageError(`Unknown profile "${name}". Run \`burnless profiles list\`.`);
  }
  return profile;
}
