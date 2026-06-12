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
