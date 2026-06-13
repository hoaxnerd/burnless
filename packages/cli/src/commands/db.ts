import type { Command } from "commander";
import { runAction } from "../context";
import { UsageError } from "../errors";
import { prepareArtifactEnv } from "../local/artifact";
import { dbStatus, runMigrate } from "../local/db";

/** Inject staged artifact paths (migrations dir) before any DB op — no-op in dev. */
function prep(): void {
  prepareArtifactEnv();
}

/** `burnless db migrate | status | push` — local data-dir ops (spec §3, L1). */
export function registerDb(program: Command): void {
  const db = program.command("db").description("Local database operations");

  db.command("migrate")
    .description("Apply pending migrations to the local database")
    .action(async (_opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        prep();
        const { driver } = await runMigrate();
        if (ctx.json) process.stdout.write(JSON.stringify({ ok: true, driver }) + "\n");
        else process.stderr.write(`Migrations applied (${driver}).\n`);
      }, { allowMissingProfile: true });
    });

  db.command("status")
    .description("Show the local database driver and connectivity")
    .action(async (_opts, cmd: Command) => {
      await runAction(cmd, async (ctx) => {
        prep();
        const status = await dbStatus();
        if (ctx.json) process.stdout.write(JSON.stringify(status) + "\n");
        else process.stderr.write(`Driver: ${status.driver} — connected: ${status.connected}\n`);
      }, { allowMissingProfile: true });
    });

  db.command("push")
    .description("Dev-only schema push (not available in the shipped artifact)")
    .action(async (_opts, cmd: Command) => {
      await runAction(cmd, async () => {
        prep();
        throw new UsageError(
          "`db push` is a dev-only convenience (no migration files). " +
            "Use `burnless db migrate` for the shipped artifact, or `pnpm db:push` in the repo.",
        );
      }, { allowMissingProfile: true });
    });
}
