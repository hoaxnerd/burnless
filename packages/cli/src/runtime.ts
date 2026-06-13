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
]);

/** The first positional token (the verb), skipping node + script + leading flags. */
export function topVerb(argv: string[]): string | undefined {
  for (const tok of argv.slice(2)) {
    if (!tok.startsWith("-")) return tok;
  }
  return undefined;
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
  ) => { on: (ev: string, cb: (code: number) => void) => void };
  existsFn?: (p: string) => boolean;
}

/**
 * Exec the fat-artifact with the local-verb argv, inheriting stdio. Resolves with the
 * child's exit code. Throws UsageError if the artifact isn't present yet — P5 adds the
 * download; until then this is the honest "run the installer first" path.
 */
export async function delegateToArtifact(
  argv: string[],
  opts: DelegateOptions = {},
): Promise<number> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? os.homedir();
  const exists = opts.existsFn ?? existsSync;
  const doSpawn =
    opts.spawnFn ?? (spawn as unknown as NonNullable<DelegateOptions["spawnFn"]>);

  const artifact = resolveArtifactPath(env, home);
  if (!exists(artifact)) {
    throw new UsageError(
      `Local-instance commands need the burnless app artifact, which isn't installed yet ` +
        `(looked at ${artifact}).\n` +
        `Install it with the curl|sh installer, or set BURNLESS_ARTIFACT to a built artifact. ` +
        `(Automatic download arrives in a later release.)`,
    );
  }

  const child = doSpawn(artifact, argv.slice(2), { stdio: "inherit", env });
  return new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(typeof code === "number" ? code : 0));
  });
}
