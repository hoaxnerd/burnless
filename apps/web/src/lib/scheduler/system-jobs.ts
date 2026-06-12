// apps/web/src/lib/scheduler/system-jobs.ts
import type { SystemJob } from "./types";

/**
 * Operational jobs registered in code (NOT in the scheduledJobs table). The
 * scheduler core (core.ts) evaluates each against the current minute. Handlers
 * are added in Tasks 3–5; this starts empty so the registry shape is testable
 * first.
 */
export const SYSTEM_JOBS: SystemJob[] = [];
