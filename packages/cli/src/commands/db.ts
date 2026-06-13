import type { Command } from "commander";
import { runAction } from "../context";
import { UsageError } from "../errors";
import { dbStatus, runMigrate } from "../local/db";

/** `burnless db migrate | status | push` — local data-dir ops (spec §3, L1). */
export function registerDb(program: Command): void {
  const db = program.command("db").description("Local database operations");

  db.command("migrate")
    .description("Apply pending migrations to the local database")
    .action(async (_opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        const { driver } = await runMigrate();
        if (ctx.json) process.stdout.write(JSON.stringify({ ok: true, driver }) + "\n");
        else process.stderr.write(`Migrations applied (${driver}).\n`);
      });
    });

  db.command("status")
    .description("Show the local database driver and connectivity")
    .action(async (_opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        const status = await dbStatus();
        if (ctx.json) process.stdout.write(JSON.stringify(status) + "\n");
        else process.stderr.write(`Driver: ${status.driver} — connected: ${status.connected}\n`);
      });
    });

  db.command("push")
    .description("Dev-only schema push (not available in the shipped artifact)")
    .action(async (_opts, cmd: Command) => {
      await runAction(cmd, async () => {
        throw new UsageError(
          "`db push` is a dev-only convenience (no migration files). " +
            "Use `burnless db migrate` for the shipped artifact, or `pnpm db:push` in the repo.",
        );
      });
    });
}
