/**
 * Thin/fat dispatch seam (spec L2/L3). The thin npm package serves remote-client +
 * simple verbs natively; LOCAL_VERBS are delegated by exec to the downloaded
 * fat-artifact. The fat-artifact runs everything natively. Mode is decided per
 * invocation from env (the thin npm entry sets BURNLESS_RUNTIME=thin at build).
 */
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
