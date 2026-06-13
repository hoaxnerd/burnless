import type { Command } from "commander";
import { runAction } from "../context";
import { prepareArtifactEnv } from "../local/artifact";
import { runMigrate } from "../local/db";
import { readInstanceEnv } from "../local/home";
import { assertNodeVersion } from "../local/preflight";
import { ensureAuthSecret, ensureSecretsKey } from "../local/secrets";

export interface BootstrapResult {
  driver: "postgres" | "pglite";
  keyGenerated: boolean;
}

/**
 * First-run setup: secrets key + migrate, then (self-host only) the claimable owner
 * USER + install COMPANY so `burnless provider add` works immediately after bootstrap.
 *
 * bootstrap does NOT boot Next/instrumentation, so the install-company is created here
 * directly via the @burnless/db primitives (mirrors instrumentation's ensureLocalUser +
 * ensureLocalCompany). Without this, `provider add` right after `bootstrap` fails with
 * "No company yet". The CLI is not in the web capability context, so self-host is gated
 * logically via BURNLESS_DEPLOYMENT !== "cloud" (the same source getEdition() keys off).
 * Triple-lock idempotency in the primitives makes the repeated boot safe.
 */
export async function runBootstrap(opts: { home?: string } = {}): Promise<BootstrapResult> {
  prepareArtifactEnv(); // inject staged artifact paths (migrations dir) — no-op in dev
  assertNodeVersion(); // hard Node>=20.9.0 gate (installer provisions; this is the backstop)
  const hadKey =
    (process.env.SECRETS_ENCRYPTION_KEY?.trim().length ?? 0) > 0 ||
    (readInstanceEnv(opts.home).SECRETS_ENCRYPTION_KEY?.length ?? 0) > 0;
  ensureSecretsKey({ home: opts.home, env: process.env });
  ensureAuthSecret({ home: opts.home, env: process.env });
  const { driver } = await runMigrate();

  // Self-host only: create the claimable owner user + install company (boot-parity).
  if (process.env.BURNLESS_DEPLOYMENT !== "cloud") {
    const {
      closeDatabase,
      createOwnerCompanyIfNone,
      createOwnerUserIfNone,
      getOwnerUser,
      initDatabase,
      isDatabaseBooted,
    } = await import("@burnless/db");
    const owned = !isDatabaseBooted();
    await initDatabase();
    try {
      await createOwnerUserIfNone();
      const owner = await getOwnerUser();
      if (owner) await createOwnerCompanyIfNone(owner.id);
    } finally {
      if (owned) await closeDatabase();
    }
  }

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
