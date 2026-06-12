// apps/web/src/lib/scheduler/core.ts
import { cronMatches } from "./cron";
import { SYSTEM_JOBS } from "./system-jobs";
import type { JobResult, SystemJob } from "./types";
import { runDueScheduledJobs } from "@/lib/automations/dispatch";
import { logger } from "@/lib/logger";

const log = logger("scheduler");

export interface RunDueOutcome {
  ran: number;
  results: Array<{ id: string } & JobResult>;
  scheduledJobsRan?: number;
}

/**
 * Find the due jobs for `now` and run them. Errors are isolated per job (one
 * failure never blocks the others). `jobs` is injectable for tests; in
 * production it defaults to the code-registered SYSTEM_JOBS. The DB-backed
 * user scheduledJobs source is folded in after the system-job loop (the two
 * dispatch paths are independent — a failure in one never blocks the other).
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

  let scheduledJobsRan = 0;
  try {
    const sched = await runDueScheduledJobs(now);
    scheduledJobsRan = sched.ran;
  } catch (err) {
    log.error(`scheduled-job dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ran: due.length, results, scheduledJobsRan };
}
