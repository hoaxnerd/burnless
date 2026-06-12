// apps/web/src/lib/scheduler/system-jobs.ts
import type { SystemJob } from "./types";
import { cleanupExpiredData } from "@/lib/data-retention";
import { runWeeklyDigest } from "@/lib/cron/weekly-digest";

/**
 * Operational jobs registered in code (NOT in the scheduledJobs table). The
 * scheduler core (core.ts) evaluates each against the current minute. Plan 4
 * will fold DB-backed user jobs in alongside these.
 */
export const SYSTEM_JOBS: SystemJob[] = [
  {
    id: "data-retention",
    schedule: "0 3 * * *",
    run: async () => {
      const r = await cleanupExpiredData();
      return {
        ok: true,
        summary: `Purged ${r.conversationsDeleted} conversations, ${r.cacheDeleted} cache entries`,
      };
    },
  },
  {
    id: "weekly-digest",
    schedule: "0 8 * * 1",
    run: async () => {
      const r = await runWeeklyDigest();
      return { ok: true, summary: `Weekly digest: ${r.generated}/${r.total} sent` };
    },
  },
];
