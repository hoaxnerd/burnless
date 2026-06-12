// apps/web/src/lib/scheduler/types.ts
/** Outcome of a single job run. `summary` feeds run history/notifications (Plan 2/4). */
export interface JobResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

/** A code-registered operational job (not user data). Plan 4 adds DB-backed user jobs alongside. */
export interface SystemJob {
  id: string;
  /** 5-field UTC cron expression. */
  schedule: string;
  run: () => Promise<JobResult>;
}
