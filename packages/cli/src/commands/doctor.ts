import type { Command } from "commander";
import { green, red } from "../ansi";
import { runAction } from "../context";
import { doctor } from "../local/preflight";

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
              process.stderr.write(`${c.ok ? green("✓") : red("✗")} ${c.name}: ${c.detail}\n`);
            }
          }
          if (checks.some((c) => !c.ok)) process.exitCode = 1;
        },
        { allowMissingProfile: true },
      );
    });
}
