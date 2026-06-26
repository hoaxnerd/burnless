import { eq } from "drizzle-orm";
import { db, integrations } from "@burnless/db";
import { runIntegrationSync } from "@/lib/integrations/sync";
import { logger } from "@/lib/logger";

const log = logger("integration-sync");

/**
 * Periodic driver behind the `integration-sync` SYSTEM_JOB. Selects every ACTIVE
 * integration across all companies and runs an incremental `runIntegrationSync`
 * for each.
 *
 * Error-isolated: each sync runs inside its own try/catch, so one company's
 * failure (bad creds, provider outage, …) is recorded as `failed` and does NOT
 * stop the others. The driver itself never throws — the job's `run()` reports a
 * summary, not a crash.
 */
export async function runAllIntegrationSyncs(): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;

  try {
    const active = await db
      .select()
      .from(integrations)
      .where(eq(integrations.status, "active"));

    for (const row of active) {
      try {
        await runIntegrationSync(row.companyId, row.type, { mode: "incremental" });
        synced++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        log.error({ companyId: row.companyId, type: row.type, err: message }, "integration sync failed");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "integration-sync: db select failed, aborting run");
  }

  return { synced, failed };
}
