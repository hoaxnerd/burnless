import type { Command } from "commander";
import { runAction } from "../context";
import { runMigrate } from "../local/db";
import { readInstanceEnv } from "../local/home";
import { ensureSecretsKey } from "../local/secrets";

export interface BootstrapResult {
  driver: "postgres" | "pglite";
  keyGenerated: boolean;
}

/** Infra-only first-run setup (key + migrate). Owner-creation = P2 (see plan note). */
export async function runBootstrap(opts: { home?: string } = {}): Promise<BootstrapResult> {
  const hadKey =
    (process.env.SECRETS_ENCRYPTION_KEY?.trim().length ?? 0) > 0 ||
    (readInstanceEnv(opts.home).SECRETS_ENCRYPTION_KEY?.length ?? 0) > 0;
  ensureSecretsKey({ home: opts.home, env: process.env });
  const { driver } = await runMigrate();
  return { driver, keyGenerated: !hadKey };
}

/** `burnless bootstrap` — headless setup (spec §3). */
export function registerBootstrap(program: Command): void {
  program
    .command("bootstrap")
    .description("One-shot headless setup: generate the secrets key and migrate")
    .action(async (_opts, cmd: Command) => {
      await runAction(
        cmd,
        async (ctx) => {
          const result = await runBootstrap();
          if (ctx.json) {
            process.stdout.write(JSON.stringify(result) + "\n");
          } else {
            process.stderr.write(
              `Bootstrap done (${result.driver}; key ${result.keyGenerated ? "generated" : "already set"}). ` +
                `Run \`burnless start\` to launch.\n`,
            );
          }
        },
        { allowMissingProfile: true },
      );
    });
}
