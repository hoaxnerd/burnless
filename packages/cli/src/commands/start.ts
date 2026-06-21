import type { Command } from "commander";
import { dim } from "../ansi";
import { renderBanner } from "../banner";
import { runAction } from "../context";
import { UsageError } from "../errors";
import { confirm, withSpinner } from "../interactive";
import { prepareArtifactEnv, resolveNodeBinary } from "../local/artifact";
import { runMigrate } from "../local/db";
import { loadInstanceEnv } from "../local/home";
import { assertNodeVersion, doctor } from "../local/preflight";
import { ensureAuthSecret, ensureSecretsKey } from "../local/secrets";
import { resolveServerEntry, startServer } from "../local/server";
import { versionString } from "../version";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Network-exposure guard (S4a hard constraint, spec §4). Auto-login admits the owner
 * with no credential check, so loopback is the only boundary; a wider bind needs an
 * explicit acknowledgement. (The claimed-ness guard lands in a later plan with the
 * `users`/`config` verbs — this is the flag-level refusal.)
 */
export function assertExposureAllowed(host: string, unsafeExpose: boolean): void {
  if (LOOPBACK.has(host) || unsafeExpose) return;
  throw new UsageError(
    `Refusing to bind ${host}: auto-login has no password gate, so a non-loopback bind ` +
      `would let anyone on the network in as the owner.\n` +
      `Bind 127.0.0.1 (default), or pass --unsafe-expose if you understand the risk ` +
      `(set a password first with a claimed identity).`,
  );
}

/**
 * Default the CSRF origin allowlist to the bind origin on a loopback start (S5 P4 11a).
 *
 * The standalone artifact runs NODE_ENV=production, where the CSRF origin allowlist
 * (`apps/web/src/proxy.ts` getAllowedOrigins) is built ONLY from NEXT_PUBLIC_APP_URL +
 * ALLOWED_ORIGINS and is NOT relaxed for loopback. With neither var set, the allowlist is
 * empty → every browser mutation 403s. So a real `burnless start` on http://127.0.0.1:2876
 * with no env would be broken out-of-the-box.
 *
 * CRITICAL: `NEXT_PUBLIC_APP_URL` is a `NEXT_PUBLIC_*` var — Next INLINES it at BUILD time,
 * so setting it at runtime does NOT reach the compiled middleware (verified: the built
 * `middleware.js` contains no `process.env.NEXT_PUBLIC_APP_URL` reference). The
 * runtime-effective allowlist var is `ALLOWED_ORIGINS` (read live in the bundle). So the
 * load-bearing default is ALLOWED_ORIGINS; we also set NEXT_PUBLIC_APP_URL for the routes
 * that DO read it at runtime (OAuth AS issuer / PRM resource derive from it).
 *
 * Only fires for loopback binds. Non-loopback binds are NOT auto-set — the operator must
 * supply their real public origin (exposure already requires --unsafe-expose). Each var is
 * set only when unset/empty (explicit values always win).
 *
 * Returns the bind origin to use, or null to leave env untouched.
 */
export function defaultAppUrlForLoopback(
  host: string,
  port: number,
  env: NodeJS.ProcessEnv,
): string | null {
  // Only meaningful for loopback (non-loopback operators set their own origin).
  if (!LOOPBACK.has(host)) return null;
  // If either allowlist source is already set, the operator has configured CSRF — defer.
  if (env.NEXT_PUBLIC_APP_URL?.trim() || env.ALLOWED_ORIGINS?.trim()) return null;
  const displayHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${displayHost}:${port}`;
}

/** A loud warning (not a hard block) when exposing a non-loopback host with an unclaimed owner. */
export function exposeWarning(host: string, ownerClaimed: boolean): string {
  if (LOOPBACK.has(host) || ownerClaimed) return "";
  return (
    `⚠ Exposing ${host} with an UNCLAIMED owner (no password). Auto-login will admit anyone ` +
    `who can reach this address as the owner. Set a password (\`burnless users passwd\`) and ` +
    `consider \`config set BURNLESS_CAP_AUTO_LOGIN=off\`.`
  );
}

/**
 * Decide whether to open a browser: explicit --open / --no-open win over the prompt;
 * with neither flag, fall back to the interactive confirm (TTY-graceful, default yes).
 */
export async function resolveOpenBrowser(o: {
  open?: boolean;
  noOpen?: boolean;
  confirmFn: () => Promise<boolean>;
}): Promise<boolean> {
  if (o.open) return true;
  if (o.noOpen) return false;
  return o.confirmFn();
}

/** `burnless start` — boot the local instance (spec §3/§4). */
export function registerStart(program: Command): void {
  program
    .command("start")
    .description("Start the local burnless instance")
    .option("--host <host>", "host to bind", "127.0.0.1")
    .option("--port <port>", "port to listen on", "2876")
    .option("--no-migrate", "skip applying migrations before boot")
    .option("--open", "open the app in a browser after start")
    .option("--no-open", "do not open the browser (skip the prompt)")
    .option("--unsafe-expose", "allow binding a non-loopback host (see the warning)")
    .action(
      async (
        opts: { host: string; port: string; migrate: boolean; open?: boolean; noOpen?: boolean; unsafeExpose?: boolean },
        cmd: Command,
      ) => {
        await runAction(
          cmd,
          async (ctx) => {
            prepareArtifactEnv(); // inject staged artifact paths (BURNLESS_SERVER_ENTRY/migrations/vector) — no-op in dev
            assertNodeVersion(); // hard Node>=20.9.0 gate (installer provisions; this is the backstop)
            loadInstanceEnv(); // source ~/.burnless/instance.env into process.env (config set / AI vars)
            assertExposureAllowed(opts.host, opts.unsafeExpose === true);
            const port = Number(opts.port);
            const displayHost = opts.host.includes(":") ? `[${opts.host}]` : opts.host;

            if (!ctx.json) process.stderr.write(renderBanner(versionString()) + "\n");

            const checks = await doctor({ port, host: opts.host });
            const failed = checks.filter((c) => !c.ok && c.name !== "secrets_key");
            if (failed.length > 0) {
              throw new UsageError(
                `Preflight failed:\n` + failed.map((c) => `  - ${c.name}: ${c.detail}`).join("\n"),
              );
            }

            ensureSecretsKey({ env: process.env });
            ensureAuthSecret({ env: process.env });

            // OOTB CSRF correctness (S5 P4 11a): on a loopback bind with no allowlist set,
            // default the bind origin BEFORE spawning so the server inherits a non-empty CSRF
            // origin allowlist (else every browser mutation 403s). ALLOWED_ORIGINS is the
            // runtime-effective var (NEXT_PUBLIC_APP_URL is build-time-inlined → no runtime
            // effect on middleware); we set both — ALLOWED_ORIGINS for CSRF, the public-app-url
            // for the runtime OAuth issuer/PRM routes that read it live.
            const appUrl = defaultAppUrlForLoopback(opts.host, port, process.env);
            if (appUrl) {
              process.env.ALLOWED_ORIGINS = appUrl;
              process.env.NEXT_PUBLIC_APP_URL = appUrl;
            }

            if (opts.migrate) await withSpinner("Applying migrations", () => runMigrate());

            // Loud (non-blocking) warning if exposing an unclaimed instance (S5 P2).
            if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(opts.host)) {
              try {
                const { initDatabase, isOwnerClaimed, closeDatabase } = await import("@burnless/db");
                await initDatabase();
                try {
                  const claimed = await isOwnerClaimed();
                  const warning = exposeWarning(opts.host, claimed);
                  if (warning) process.stderr.write(warning + "\n");
                } finally {
                  await closeDatabase();
                }
              } catch {
                // best-effort; never block start on this check
              }
            }

            const entry = resolveServerEntry();
            if (!entry) {
              throw new UsageError(
                "No server entry found (BURNLESS_SERVER_ENTRY unset). The bundled server is " +
                  "produced by the fat-artifact packaging (a later release); set " +
                  "BURNLESS_SERVER_ENTRY to a built server.js to start manually.",
              );
            }

            // Decide browser-open BEFORE spawning so we don't prompt after the server is
            // already running silently. commander's --open/--no-open pair collapses to a
            // single `opts.open` (true | false | undefined). JSON mode is non-interactive:
            // never prompt — open only if --open was explicitly passed.
            const shouldOpen = ctx.json
              ? opts.open === true
              : await resolveOpenBrowser({
                  open: opts.open === true,
                  noOpen: opts.open === false,
                  confirmFn: () => confirm({ message: "Open burnless in your browser?", default: true }),
                });

            process.stderr.write(dim(`Starting on http://${displayHost}:${port} …`) + "\n");
            const child = startServer({
              entry,
              host: opts.host,
              port,
              env: process.env,
              nodeBin: resolveNodeBinary(),
            });
            if (shouldOpen) {
              void import("node:child_process").then(({ exec }) => {
                const url = `http://${displayHost}:${port}`;
                const opener =
                  process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
                exec(`${opener} ${url}`);
              });
            }
            await new Promise<void>((resolve) => child.on("exit", () => resolve()));
          },
          { allowMissingProfile: true },
        );
      },
    );
}
