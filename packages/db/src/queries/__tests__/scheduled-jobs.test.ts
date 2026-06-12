import { describe, it, expect, vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

vi.mock("../../index", () => ({ get db() { return getTestDb(); } }));

import { createCompanyContext } from "../../__tests__/factories";
import { scheduledJobs, scheduledJobRuns } from "../../schema";
import { eq } from "drizzle-orm";

describe("scheduledJobs / scheduledJobRuns schema", () => {
  it("inserts a job with sane defaults (enabled, active, smart, 0 failures)", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const [job] = await db
      .insert(scheduledJobs)
      .values({
        companyId: ctx.company.id,
        createdByUserId: ctx.user.id,
        name: "Weekly Stripe sync",
        prompt: "Pull last week's Stripe revenue and update Subscriptions MRR.",
        actionKind: "write",
        allowedTools: ["update_revenue_stream", "mcp__stripe__list_charges"],
        boundConnectionIds: [],
        schedule: "0 9 * * 1",
        nextRunAt: new Date("2026-06-15T09:00:00Z"),
      })
      .returning();
    expect(job.id).toBeTruthy();
    expect(job.enabled).toBe(true);
    expect(job.status).toBe("active");
    expect(job.notifyPolicy).toBe("smart");
    expect(job.consecutiveFailures).toBe(0);
    expect(job.deletedAt).toBeNull();
    expect(Array.isArray(job.allowedTools)).toBe(true);
  });

  it("inserts a run row linked to the job (cascade)", async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const [job] = await db.insert(scheduledJobs).values({
      companyId: ctx.company.id, createdByUserId: ctx.user.id, name: "j", prompt: "p",
      actionKind: "notify", allowedTools: [], boundConnectionIds: [], schedule: "0 8 * * *",
      nextRunAt: new Date(),
    }).returning();
    const [run] = await db.insert(scheduledJobRuns).values({
      scheduledJobId: job.id, companyId: ctx.company.id, status: "running", trigger: "schedule",
    }).returning();
    expect(run.id).toBeTruthy();
    expect(run.status).toBe("running");
    const rows = await db.select().from(scheduledJobRuns).where(eq(scheduledJobRuns.scheduledJobId, job.id));
    expect(rows).toHaveLength(1);
  });
});

import {
  createScheduledJob,
  getScheduledJob,
  listScheduledJobs,
  updateScheduledJob,
  softDeleteScheduledJob,
  listDueScheduledJobs,
  startScheduledJobRun,
  finishScheduledJobRun,
  listScheduledJobRuns,
  countScheduledJobs,
} from "../scheduled-jobs";

describe("scheduled-jobs query helpers", () => {
  it("create + get + list scoped to company; soft delete hides it", async () => {
    const a = await createCompanyContext();
    const other = await createCompanyContext();
    const job = await createScheduledJob({
      companyId: a.company.id, createdByUserId: a.user.id, name: "J", prompt: "P",
      actionKind: "notify", allowedTools: ["list_accounts"], boundConnectionIds: [],
      schedule: "0 8 * * *", nextRunAt: new Date("2030-01-01T08:00:00Z"),
    });
    expect(await getScheduledJob(job.id, a.company.id)).toBeTruthy();
    expect(await getScheduledJob(job.id, other.company.id)).toBeNull(); // cross-company isolation
    expect((await listScheduledJobs(a.company.id)).length).toBe(1);
    await softDeleteScheduledJob(job.id, a.company.id);
    expect(await getScheduledJob(job.id, a.company.id)).toBeNull(); // deletedAt filters it out
    expect((await listScheduledJobs(a.company.id)).length).toBe(0);
  });

  it("listDueScheduledJobs returns only enabled+active jobs with nextRunAt <= now", async () => {
    const a = await createCompanyContext();
    const past = await createScheduledJob({
      companyId: a.company.id, createdByUserId: a.user.id, name: "due", prompt: "P",
      actionKind: "notify", allowedTools: [], boundConnectionIds: [], schedule: "* * * * *",
      nextRunAt: new Date("2020-01-01T00:00:00Z"),
    });
    await createScheduledJob({
      companyId: a.company.id, createdByUserId: a.user.id, name: "future", prompt: "P",
      actionKind: "notify", allowedTools: [], boundConnectionIds: [], schedule: "* * * * *",
      nextRunAt: new Date("2999-01-01T00:00:00Z"),
    });
    const disabled = await createScheduledJob({
      companyId: a.company.id, createdByUserId: a.user.id, name: "off", prompt: "P",
      actionKind: "notify", allowedTools: [], boundConnectionIds: [], schedule: "* * * * *",
      nextRunAt: new Date("2020-01-01T00:00:00Z"),
    });
    await updateScheduledJob(disabled.id, a.company.id, { enabled: false });
    const due = await listDueScheduledJobs(new Date("2026-06-12T00:00:00Z"));
    expect(due.map((j) => j.id)).toEqual([past.id]);
  });

  it("run lifecycle: start -> finish records duration/status; list newest-first", async () => {
    const a = await createCompanyContext();
    const job = await createScheduledJob({
      companyId: a.company.id, createdByUserId: a.user.id, name: "J", prompt: "P",
      actionKind: "write", allowedTools: [], boundConnectionIds: [], schedule: "0 8 * * *",
      nextRunAt: new Date(),
    });
    const run = await startScheduledJobRun({ scheduledJobId: job.id, companyId: a.company.id, trigger: "manual" });
    expect(run.status).toBe("running");
    await finishScheduledJobRun(run.id, { status: "success", summary: "did the thing", tokensUsed: 1234, output: { ok: true } });
    const runs = await listScheduledJobRuns(job.id, a.company.id, 10);
    expect(runs[0].status).toBe("success");
    expect(runs[0].summary).toBe("did the thing");
    expect(runs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("countScheduledJobs counts only live (non-deleted) jobs for the company", async () => {
    const a = await createCompanyContext();
    const j = await createScheduledJob({
      companyId: a.company.id, createdByUserId: a.user.id, name: "J", prompt: "P",
      actionKind: "notify", allowedTools: [], boundConnectionIds: [], schedule: "0 8 * * *", nextRunAt: new Date(),
    });
    expect(await countScheduledJobs(a.company.id)).toBe(1);
    await softDeleteScheduledJob(j.id, a.company.id);
    expect(await countScheduledJobs(a.company.id)).toBe(0);
  });
});
