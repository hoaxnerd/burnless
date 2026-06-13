import type { Command } from "commander";
import { green, red } from "../ansi";
import { runAction } from "../context";
import { health } from "../local/preflight";

/** `burnless health` — quick liveness (spec §3). */
export function registerHealth(program: Command): void {
  program
    .command("health")
    .description("Quick liveness check for a local instance")
    .action(async (_opts, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          const checks = await health({});
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
