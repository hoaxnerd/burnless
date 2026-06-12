// apps/web/src/lib/scheduler/driver.ts
import { getEdition } from "@/lib/capabilities";
import { runDueJobs } from "@/lib/scheduler/core";
import { logger } from "@/lib/logger";

export type SchedulerDriver = "in_process" | "external" | "off";

/** Explicit BURNLESS_SCHEDULER_DRIVER wins; else derive from edition. */
export function resolveSchedulerDriver(): SchedulerDriver {
  const raw = process.env.BURNLESS_SCHEDULER_DRIVER?.toLowerCase();
  if (raw === "in_process" || raw === "external" || raw === "off") return raw;
  return getEdition() === "cloud" ? "external" : "in_process";
}

const TICK_MS = 60_000;
// HMR/multi-import-safe singleton flag (mirrors globalThis.__burnless_db).
const g = globalThis as unknown as { __burnless_scheduler?: ReturnType<typeof setInterval> | null };

// In-flight guard: skips an overlapping tick if the previous runDueJobs Promise
// has not resolved yet (a >60s run would otherwise double-run concurrently).
// Distinct from the globalThis singleton, which guards double-START.
let ticking = false;

/** Start the self_host in-process tick. No-op unless the resolved driver is in_process. Idempotent. */
export function startInProcessScheduler(): void {
  if (resolveSchedulerDriver() !== "in_process") return;
  if (g.__burnless_scheduler) return; // already running
  logger("scheduler").info("starting in-process scheduler (60s tick)");
  g.__burnless_scheduler = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void runDueJobs(new Date())
      .catch((e) => logger("scheduler").error(`tick failed: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => { ticking = false; });
  }, TICK_MS);
}

/** Test-only reset. */
export function __resetSchedulerForTests(): void {
  if (g.__burnless_scheduler) clearInterval(g.__burnless_scheduler);
  g.__burnless_scheduler = null;
  ticking = false;
}
