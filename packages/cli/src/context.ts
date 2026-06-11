/**
 * Per-invocation context: resolved config + profile + keychain + global flags.
 * runAction is the single error boundary — it maps CliError exit codes (1 =
 * server/tool, 2 = user/validation) and writes errors to stderr so --json
 * stdout stays machine-clean.
 */
import type { Command } from "commander";
import {
  getProfile,
  loadConfig,
  resolveProfileName,
  saveConfig,
  type CliConfig,
  type Profile,
} from "./config";
import { CliError } from "./errors";
import { createKeychain, type Keychain } from "./keychain";
import { openSession, type McpSession } from "./mcp-session";
import { resolveToken } from "./oauth";

export interface GlobalOpts {
  profile?: string;
  json?: boolean;
}

export interface CliContext {
  config: CliConfig;
  profileName: string;
  profile: Profile;
  keychain: Keychain;
  json: boolean;
  homeDir?: string;
}

export interface BuildContextOptions {
  /** `login --url` may target a brand-new profile name — allow it to not exist yet. */
  allowMissingProfile?: boolean;
  homeDir?: string;
}

export function buildContext(globalOpts: GlobalOpts, opts: BuildContextOptions = {}): CliContext {
  const config = loadConfig(opts.homeDir);
  const profileName = resolveProfileName(config, globalOpts.profile);
  const profile = opts.allowMissingProfile
    ? (config.profiles[profileName] ?? { baseUrl: "http://localhost:3000", authMode: "pat" as const })
    : getProfile(config, profileName);
  return {
    config,
    profileName,
    profile,
    keychain: createKeychain({ homeDir: opts.homeDir }),
    json: globalOpts.json === true,
    homeDir: opts.homeDir,
  };
}

/** Persist (create or update) the context's profile after a successful login. */
export function upsertProfile(ctx: CliContext, patch: { baseUrl: string; authMode: "pat" | "oauth" }): void {
  const existing = ctx.config.profiles[ctx.profileName];
  ctx.config.profiles[ctx.profileName] = {
    ...(existing ?? {}),
    baseUrl: patch.baseUrl,
    authMode: patch.authMode,
  };
  saveConfig(ctx.config, ctx.homeDir);
}

/** Open an authenticated MCP session for the context's profile (spec C4). */
export async function openSessionFor(ctx: CliContext): Promise<McpSession> {
  const token = await resolveToken({
    baseUrl: ctx.profile.baseUrl,
    profileName: ctx.profileName,
    keychain: ctx.keychain,
  });
  return openSession({ baseUrl: ctx.profile.baseUrl, token });
}

export async function runAction(
  cmd: Command,
  fn: (ctx: CliContext) => Promise<void>,
  opts: BuildContextOptions = {}
): Promise<void> {
  const globals = cmd.optsWithGlobals<GlobalOpts>();
  try {
    await fn(buildContext(globals, opts));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = err instanceof CliError ? err.exitCode : 1;
  }
}
