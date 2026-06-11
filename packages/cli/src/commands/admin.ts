import type { Command } from "commander";
import { runAction } from "../context";
import { UsageError } from "../errors";

/** Reserved namespace (spec C3): single binary, future self-host ops. */
export function registerAdmin(program: Command): void {
  program
    .command("admin")
    .description("Self-host operations (reserved — coming soon)")
    .argument("[args...]", "subcommand and arguments")
    .allowUnknownOption(true)
    .action(async (_args: string[], _opts: Record<string, never>, cmd: Command) => {
      await runAction(cmd, async () => {
        throw new UsageError(
          "`burnless admin` is coming soon — for self-host ops use the repo's pnpm scripts (pnpm db:migrate, pnpm db:seed, pnpm cron:worker)."
        );
      });
    });
}
