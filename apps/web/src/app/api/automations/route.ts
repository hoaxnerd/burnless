// apps/web/src/app/api/automations/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { listScheduledJobs, createScheduledJob, countScheduledJobs } from "@burnless/db";
import { requireCompanyAccess, requireRole, withErrorHandler } from "@/lib/api-helpers";
import { checkAiFeatureAllowed } from "@/lib/ai-feature-flags";
import { getSafetyLimits, computeNextRunAt } from "@/lib/automations/safety";

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const jobs = await listScheduledJobs(ctx.companyId);
  return NextResponse.json({ jobs });
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(4000),
  actionKind: z.enum(["write", "notify"]),
  allowedTools: z.array(z.string().max(200)).max(50),
  boundConnectionIds: z.array(z.string().max(100)).max(20).default([]),
  schedule: z.string().min(1).max(120),
  timezone: z.string().max(64).optional(),
  notifyPolicy: z.enum(["smart", "failures", "every", "off"]).optional(),
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const draft = createSchema.parse(await request.json());

  // Validate the cron (also yields the first nextRunAt).
  const nextRunAt = computeNextRunAt(draft.schedule, new Date());
  if (!nextRunAt) {
    return NextResponse.json({ error: "Invalid schedule expression." }, { status: 400 });
  }

  // D10: write-mode read_only → only notify-only jobs creatable.
  // Evaluated before the job cap so a categorically-forbidden write job
  // surfaces the 409 gate rather than being masked by a 429 quota error.
  if (draft.actionKind === "write") {
    const ai = await checkAiFeatureAllowed(ctx.companyId, "chat");
    if (ai.writeMode === "read_only") {
      return NextResponse.json(
        { error: "AI write-mode is read-only; only notify-only automations can be created.", code: "WRITE_MODE_READ_ONLY" },
        { status: 409 }
      );
    }
  }

  // SAFETY (both editions): per-company job cap (#28).
  const limits = getSafetyLimits();
  if ((await countScheduledJobs(ctx.companyId)) >= limits.maxJobsPerCompany) {
    return NextResponse.json({ error: `Job limit reached (${limits.maxJobsPerCompany}).` }, { status: 429 });
  }

  const job = await createScheduledJob({
    companyId: ctx.companyId,
    createdByUserId: ctx.userId,
    name: draft.name,
    prompt: draft.prompt,
    actionKind: draft.actionKind,
    allowedTools: draft.allowedTools,
    boundConnectionIds: draft.boundConnectionIds,
    schedule: draft.schedule,
    timezone: draft.timezone,
    notifyPolicy: draft.notifyPolicy,
    nextRunAt,
  });
  return NextResponse.json({ job });
});
