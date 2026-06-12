// apps/web/src/lib/scheduler/core.ts
import { cronMatches } from "./cron";
import { SYSTEM_JOBS } from "./system-jobs";
import type { JobResult, SystemJob } from "./types";
import { logger } from "@/lib/logger";

const log = logger("scheduler");

export interface RunDueOutcome {
  ran: number;
  results: Array<{ id: string } & JobResult>;
}

/**
 * Find the due jobs for `now` and run them. Errors are isolated per job (one
 * failure never blocks the others). `jobs` is injectable for tests; in
 * production it defaults to the code-registered SYSTEM_JOBS. Plan 4 will also
 * fold the DB-backed scheduledJobs source in here.
 */
export async function runDueJobs(now: Date, jobs: SystemJob[] = SYSTEM_JOBS): Promise<RunDueOutcome> {
  const due = jobs.filter((j) => cronMatches(j.schedule, now));
  const results: Array<{ id: string } & JobResult> = [];
  for (const job of due) {
    try {
      const r = await job.run();
      results.push({ id: job.id, ...r });
      if (!r.ok) log.error(`system job ${job.id} returned not-ok: ${r.error ?? ""}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error(`system job ${job.id} threw: ${error}`);
      results.push({ id: job.id, ok: false, error });
    }
  }
  return { ran: due.length, results };
}
