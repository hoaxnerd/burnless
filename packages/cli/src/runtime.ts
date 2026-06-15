/**
 * Thin/fat dispatch seam (spec L2/L3). The thin npm package serves remote-client +
 * simple verbs natively; LOCAL_VERBS are delegated by exec to the downloaded
 * fat-artifact. The fat-artifact runs everything natively. Mode is decided per
 * invocation from env (the thin npm entry sets BURNLESS_RUNTIME=thin at build).
 */
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { spawn, type SpawnOptions } from "node:child_process";
import { UsageError } from "./errors";
import { CLI_VERSION } from "./version";

export type RuntimeMode = "fat" | "thin";

/** Fat unless explicitly thin — dev + the artifact both run local verbs in-process. */
export function resolveRuntimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  return env.BURNLESS_RUNTIME === "thin" ? "thin" : "fat";
}

/**
 * Local-instance verbs: operate the local data dir / boot the server. Grows in later
 * plans (users/config in P2, provider/key/model conditionally in P3, update in P5).
 */
export const LOCAL_VERBS: ReadonlySet<string> = new Set([
  "start",
  "db",
  "health",
  "doctor",
  "bootstrap",
  "users",
  "config",
  "provider",
  "key",
  "model",
  "update",
]);

/**
 * Global flags that CONSUME the next argv token as their value. A value placed
 * before the verb (e.g. `--profile work provider list`) must NOT be mistaken for
 * the verb. The `--flag=value` form is self-contained, so it never reaches here.
 * `--json` and `--no-color` are booleans and consume nothing.
 */
const VALUE_TAKING_GLOBALS: ReadonlySet<string> = new Set(["--profile"]);

/** The first positional token (the verb), skipping node + script + leading flags. */
export function topVerb(argv: string[]): string | undefined {
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === undefined) continue;
    if (!tok.startsWith("-")) return tok;
    // A value-taking flag in its split `--profile name` form swallows the next token.
    if (VALUE_TAKING_GLOBALS.has(tok)) i++;
  }
  return undefined;
}

/** A bare invocation (no verb) launches `start`; --help/--version are left for commander. */
export function bareVerbOrDefault(argv: string[]): string | undefined {
  const v = topVerb(argv);
  if (v !== undefined) return v;
  const rest = argv.slice(2);
  if (rest.some((t) => t === "--help" || t === "-h" || t === "--version" || t === "-V")) return undefined;
  return "start";
}

/** Where the downloaded fat-artifact binary lives (download lands in P5). */
export function resolveArtifactPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  const override = env.BURNLESS_ARTIFACT?.trim();
  if (override) return override;
  return join(home, ".burnless", "versions", "current", "burnless");
}

export interface DelegateOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  spawnFn?: (
    cmd: string,
    args: string[],
    opts: SpawnOptions,
  ) => { on: (ev: string, cb: (arg: number | Error | null) => void) => void };
  existsFn?: (p: string) => boolean;
  ensureFn?: (opts: { version: string; home: string; env: NodeJS.ProcessEnv }) => Promise<void>;
}

/**
 * Default download-on-demand: lazily import the pure-JS release engine (keeping it out of
 * the thin entry's eager graph and never reached by the fat entry) and ensure the artifact
 * for `version` is present. `ensureArtifact` reads its base + env internally via
 * `resolveReleaseSource()` — so we only forward `{ version, home }`.
 */
export async function defaultEnsure(opts: {
  version: string;
  home: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  // Always vendor our pinned Node for the app (no-op on musl/Alpine — apk node is used).
  const { ensureVendoredNode } = await import("./bootstrap/node-provision");
  await ensureVendoredNode({ home: opts.home, env: opts.env });
  const { ensureArtifact } = await import("./bootstrap/release");
  await ensureArtifact({ version: opts.version, home: opts.home });
}

/**
 * Exec the fat-artifact with the local-verb argv, inheriting stdio. Resolves with the
 * child's exit code. If the artifact is absent, downloads it on demand (Model B) via
 * `ensureFn` then re-checks; throws UsageError only if it's still missing afterward.
 */
export async function delegateToArtifact(
  argv: string[],
  opts: DelegateOptions = {},
): Promise<number> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? os.homedir();
  const exists = opts.existsFn ?? existsSync;
  const ensure = opts.ensureFn ?? defaultEnsure;
  const doSpawn =
    opts.spawnFn ?? (spawn as unknown as NonNullable<DelegateOptions["spawnFn"]>);

  const artifact = resolveArtifactPath(env, home);
  if (!exists(artifact)) {
    const version = env.BURNLESS_RELEASE_VERSION?.trim() || CLI_VERSION;
    await ensure({ version, home, env });
    if (!exists(artifact)) {
      throw new UsageError(
        `Could not obtain the burnless app artifact (looked at ${artifact}). ` +
          `Check your network / BURNLESS_RELEASE_BASE_URL, or install via the curl|sh installer.`,
      );
    }
  }

  const child = doSpawn(artifact, argv.slice(2), { stdio: "inherit", env });
  // "error" fires when the exec itself fails (launcher not executable, noexec fs, ENOENT) —
  // no "exit" follows, so without this the promise would silently resolve. A null/undefined
  // exit code (e.g. killed by signal) resolves to 1, never a masking 0.
  return new Promise<number>((resolve, reject) => {
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => resolve(typeof code === "number" ? code : 1));
  });
}
