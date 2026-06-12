import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { scheduledJobs, scheduledJobRuns } from "../schema";

export type ScheduledJobActionKind = "write" | "notify";
export type ScheduledJobStatus = "active" | "disabled" | "auto_disabled" | "error";
export type ScheduledJobNotifyPolicy = "smart" | "failures" | "every" | "off";
export type ScheduledJobRunStatus = "running" | "success" | "failed" | "missed";
export type ScheduledJobRunTrigger = "schedule" | "manual" | "dry_run";

export interface CreateScheduledJobInput {
  companyId: string;
  createdByUserId: string;
  name: string;
  prompt: string;
  actionKind: ScheduledJobActionKind;
  allowedTools: string[];
  boundConnectionIds: string[];
  schedule: string;
  timezone?: string;
  notifyPolicy?: ScheduledJobNotifyPolicy;
  nextRunAt: Date;
}

export async function createScheduledJob(input: CreateScheduledJobInput) {
  const [row] = await db
    .insert(scheduledJobs)
    .values({
      companyId: input.companyId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      prompt: input.prompt,
      actionKind: input.actionKind,
      allowedTools: input.allowedTools,
      boundConnectionIds: input.boundConnectionIds,
      schedule: input.schedule,
      timezone: input.timezone ?? "UTC",
      notifyPolicy: input.notifyPolicy ?? "smart",
      nextRunAt: input.nextRunAt,
    })
    .returning();
  return row;
}

/** Single job, company-scoped, excluding soft-deleted. */
export async function getScheduledJob(id: string, companyId: string) {
  const [row] = await db
    .select()
    .from(scheduledJobs)
    .where(and(eq(scheduledJobs.id, id), eq(scheduledJobs.companyId, companyId), isNull(scheduledJobs.deletedAt)));
  return row ?? null;
}

export async function listScheduledJobs(companyId: string) {
  return db
    .select()
    .from(scheduledJobs)
    .where(and(eq(scheduledJobs.companyId, companyId), isNull(scheduledJobs.deletedAt)))
    .orderBy(desc(scheduledJobs.createdAt));
}

export async function countScheduledJobs(companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scheduledJobs)
    .where(and(eq(scheduledJobs.companyId, companyId), isNull(scheduledJobs.deletedAt)));
  return row?.count ?? 0;
}

export type UpdateScheduledJobPatch = Partial<{
  name: string;
  prompt: string;
  allowedTools: string[];
  boundConnectionIds: string[];
  schedule: string;
  timezone: string;
  enabled: boolean;
  status: ScheduledJobStatus;
  notifyPolicy: ScheduledJobNotifyPolicy;
  consecutiveFailures: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastRunCursor: Record<string, unknown> | null;
}>;

export async function updateScheduledJob(id: string, companyId: string, patch: UpdateScheduledJobPatch) {
  const [row] = await db
    .update(scheduledJobs)
    .set(patch)
    .where(and(eq(scheduledJobs.id, id), eq(scheduledJobs.companyId, companyId), isNull(scheduledJobs.deletedAt)))
    .returning();
  return row ?? null;
}

export async function softDeleteScheduledJob(id: string, companyId: string) {
  await db
    .update(scheduledJobs)
    .set({ deletedAt: new Date(), enabled: false })
    .where(and(eq(scheduledJobs.id, id), eq(scheduledJobs.companyId, companyId)));
}

/**
 * Cross-company due query for the scheduler core: enabled + active jobs whose
 * nextRunAt has arrived. `nextRunAt` is the authoritative due signal (cron is
 * only used to RECOMPUTE it after a run). Ordered by nextRunAt asc so the most
 * overdue runs first.
 */
export async function listDueScheduledJobs(now: Date) {
  return db
    .select()
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.enabled, true),
        eq(scheduledJobs.status, "active"),
        isNull(scheduledJobs.deletedAt),
        lte(scheduledJobs.nextRunAt, now)
      )
    )
    .orderBy(asc(scheduledJobs.nextRunAt));
}

// ── run lifecycle ────────────────────────────────────────────────────────────

export async function startScheduledJobRun(input: {
  scheduledJobId: string;
  companyId: string;
  trigger: ScheduledJobRunTrigger;
}) {
  const [row] = await db
    .insert(scheduledJobRuns)
    .values({ scheduledJobId: input.scheduledJobId, companyId: input.companyId, status: "running", trigger: input.trigger })
    .returning();
  return row;
}

export async function finishScheduledJobRun(
  runId: string,
  companyId: string,
  result: {
    status: Exclude<ScheduledJobRunStatus, "running">;
    summary?: string | null;
    tokensUsed?: number | null;
    output?: Record<string, unknown> | null;
    error?: string | null;
  }
) {
  // company-scoped (project convention — no cross-company write). Read startedAt
  // to compute duration without trusting the caller's clock.
  const scope = and(eq(scheduledJobRuns.id, runId), eq(scheduledJobRuns.companyId, companyId));
  const [existing] = await db
    .select({ startedAt: scheduledJobRuns.startedAt })
    .from(scheduledJobRuns)
    .where(scope);
  const finishedAt = new Date();
  const durationMs = existing ? Math.max(0, finishedAt.getTime() - existing.startedAt.getTime()) : null;
  const [row] = await db
    .update(scheduledJobRuns)
    .set({
      status: result.status,
      summary: result.summary ?? null,
      tokensUsed: result.tokensUsed ?? null,
      output: result.output ?? null,
      error: result.error ?? null,
      finishedAt,
      durationMs,
    })
    .where(scope)
    .returning();
  return row;
}

/** Record a lightweight `missed` run (downtime detected) without executing the agent. */
export async function recordMissedRun(scheduledJobId: string, companyId: string, summary: string) {
  const now = new Date();
  const [row] = await db
    .insert(scheduledJobRuns)
    .values({
      scheduledJobId, companyId, status: "missed", trigger: "schedule",
      startedAt: now, finishedAt: now, durationMs: 0, summary,
    })
    .returning();
  return row;
}

export async function listScheduledJobRuns(scheduledJobId: string, companyId: string, limit = 50) {
  return db
    .select()
    .from(scheduledJobRuns)
    .where(and(eq(scheduledJobRuns.scheduledJobId, scheduledJobId), eq(scheduledJobRuns.companyId, companyId)))
    .orderBy(desc(scheduledJobRuns.startedAt))
    .limit(limit);
}
