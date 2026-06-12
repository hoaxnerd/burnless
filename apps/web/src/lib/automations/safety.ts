// apps/web/src/lib/automations/safety.ts
/**
 * Scheduled-job safety layer (S3a Plan 4 §6). These caps are SAFETY, not
 * plan-enforcement — they apply to BOTH editions (founder: safety ≠ tiers), so
 * there is intentionally NO getEdition()/planEnforcement gate here. Values read
 * from process.env at call time so ops can tune without a rebuild.
 */
import { cronMatches } from "@/lib/scheduler/cron";

function num(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface SafetyLimits {
  maxJobsPerCompany: number;
  autoDisableAfter: number;
  runTimeoutMs: number;
  dryRunTimeoutMs: number;
  maxToolCalls: number;
}

export function getSafetyLimits(): SafetyLimits {
  return {
    maxJobsPerCompany: num("BURNLESS_JOB_MAX_PER_COMPANY", 25),
    autoDisableAfter: num("BURNLESS_JOB_AUTO_DISABLE_AFTER", 3),
    runTimeoutMs: num("BURNLESS_JOB_RUN_TIMEOUT_MS", 120_000),
    dryRunTimeoutMs: num("BURNLESS_JOB_DRY_RUN_TIMEOUT_MS", 60_000),
    // The chat loop's MAX_TOOL_ITERATIONS is 10; mirror it so callers can read one source.
    maxToolCalls: num("BURNLESS_JOB_MAX_TOOL_CALLS", 10),
  };
}

const MINUTE_MS = 60_000;
/** A run is "missed" (downtime) if its slot is overdue by more than ~2 ticks. */
const MISSED_THRESHOLD_MS = 2.5 * MINUTE_MS;

/**
 * Next minute (UTC) strictly after `from` whose cron matches. Minute-by-minute
 * scan, bounded to ~366 days so a garbage/unmatchable cron returns null instead
 * of looping forever.
 */
export function computeNextRunAt(cron: string, from: Date): Date | null {
  const start = new Date(Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS); // next whole minute
  const maxIterations = 366 * 24 * 60;
  const cursor = new Date(start.getTime());
  for (let i = 0; i < maxIterations; i++) {
    if (cronMatches(cron, cursor)) return new Date(cursor.getTime());
    cursor.setTime(cursor.getTime() + MINUTE_MS);
  }
  return null;
}

export function isMissed(nextRunAt: Date, now: Date): boolean {
  return now.getTime() - nextRunAt.getTime() > MISSED_THRESHOLD_MS;
}

export function shouldAutoDisable(consecutiveFailures: number): boolean {
  return consecutiveFailures >= getSafetyLimits().autoDisableAfter;
}
