import type { Command } from "commander";
import { green, red, yellow } from "../ansi";
import { runAction } from "../context";
import { doctor, hasFatalFailure } from "../local/preflight";

/** `burnless doctor` — deep preflight (spec §3). */
export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Run deep preflight checks for a local instance")
    .option("--port <port>", "port to probe", "2876")
    .option("--host <host>", "host to probe", "127.0.0.1")
    .action(async (opts: { port: string; host: string }, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          const checks = await doctor({ port: Number(opts.port), host: opts.host });
          if (ctx.json) {
            process.stdout.write(JSON.stringify({ checks }) + "\n");
          } else {
            for (const c of checks) {
              // A non-fatal failing check (port busy / key to be generated) shows as a
              // warning, not an error — it never blocks an update.
              const mark = c.ok ? green("✓") : c.fatal === false ? yellow("⚠") : red("✗");
              process.stderr.write(`${mark} ${c.name}: ${c.detail}\n`);
            }
          }
          // Exit non-zero only on a fatal failure (node / db driver). `update` execs this
          // (`doctor --json`) as its post-swap gate, so a busy port must not roll back.
          if (hasFatalFailure(checks)) process.exitCode = 1;
        },
        { allowMissingProfile: true },
      );
    });
}
