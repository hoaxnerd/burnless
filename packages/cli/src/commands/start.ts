import type { Command } from "commander";
import { dim } from "../ansi";
import { renderBanner } from "../banner";
import { runAction } from "../context";
import { UsageError } from "../errors";
import { runMigrate } from "../local/db";
import { doctor } from "../local/preflight";
import { ensureSecretsKey } from "../local/secrets";
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

/** A loud warning (not a hard block) when exposing a non-loopback host with an unclaimed owner. */
export function exposeWarning(host: string, ownerClaimed: boolean): string {
  if (LOOPBACK.has(host) || ownerClaimed) return "";
  return (
    `⚠ Exposing ${host} with an UNCLAIMED owner (no password). Auto-login will admit anyone ` +
    `who can reach this address as the owner. Set a password (\`burnless users passwd\`) and ` +
    `consider \`config set BURNLESS_CAP_AUTO_LOGIN=off\`.`
  );
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
    .option("--unsafe-expose", "allow binding a non-loopback host (see the warning)")
    .action(
      async (
        opts: { host: string; port: string; migrate: boolean; open?: boolean; unsafeExpose?: boolean },
        cmd: Command,
      ) => {
        await runAction(
          cmd,
          async (ctx) => {
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
            if (opts.migrate) await runMigrate();

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

            process.stderr.write(dim(`Starting on http://${displayHost}:${port} …`) + "\n");
            const child = startServer({ entry, host: opts.host, port, env: process.env });
            if (opts.open) {
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
