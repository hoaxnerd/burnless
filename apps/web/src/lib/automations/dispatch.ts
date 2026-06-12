// apps/web/src/lib/automations/dispatch.ts
import { listDueScheduledJobs, recordMissedRun } from "@burnless/db";
import { runScheduledJob } from "./runner";
import { isMissed } from "./safety";
import { logger } from "@/lib/logger";

const log = logger("automations-dispatch");

export interface DueScheduledOutcome {
  ran: number;
  failed: number;
}

/**
 * Find + run user scheduled jobs that are due (S3a Plan 4 §4). Per-job error
 * isolation — one failure never blocks the others. Per D8, a long-overdue
 * `nextRunAt` records ONE `missed` row then runs once (no replay). Concurrency
 * is bounded by the single-process in-process model plus the per-run timeout
 * (good enough for v1).
 */
export async function runDueScheduledJobs(now: Date): Promise<DueScheduledOutcome> {
  const due = await listDueScheduledJobs(now);
  let failed = 0;
  for (const job of due) {
    try {
      if (job.nextRunAt && isMissed(job.nextRunAt, now)) {
        await recordMissedRun(
          job.id,
          job.companyId,
          `Missed scheduled run (was due ${job.nextRunAt.toISOString()}); running now.`,
        );
      }
      const out = await runScheduledJob(job.id, "schedule");
      if (out.status === "failed") failed++;
    } catch (err) {
      failed++;
      log.error(`scheduled job ${job.id} dispatch threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { ran: due.length, failed };
}
