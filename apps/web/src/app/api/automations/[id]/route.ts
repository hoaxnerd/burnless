// apps/web/src/app/api/automations/[id]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getScheduledJob, updateScheduledJob, softDeleteScheduledJob, listScheduledJobRuns } from "@burnless/db";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { computeNextRunAt } from "@/lib/automations/safety";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const job = await getScheduledJob(id, ctx.companyId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const runs = await listScheduledJobRuns(id, ctx.companyId, 50);
  return NextResponse.json({ job, runs });
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  prompt: z.string().min(1).max(4000).optional(),
  allowedTools: z.array(z.string().max(200)).max(50).optional(),
  boundConnectionIds: z.array(z.string().max(100)).max(20).optional(),
  schedule: z.string().min(1).max(120).optional(),
  notifyPolicy: z.enum(["smart", "failures", "every", "off"]).optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (request: Request, { params }: Ctx) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const job = await getScheduledJob(id, ctx.companyId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = patchSchema.parse(await request.json());

  const patch: Record<string, unknown> = { ...body };

  if (body.schedule) {
    const next = computeNextRunAt(body.schedule, new Date());
    if (!next) return NextResponse.json({ error: "Invalid schedule expression." }, { status: 400 });
    patch.nextRunAt = next;
  }
  // Re-enable from a disabled/auto-disabled state → clean slate.
  if (body.enabled === true && job.status !== "active") {
    patch.status = "active";
    patch.consecutiveFailures = 0;
    patch.nextRunAt = patch.nextRunAt ?? computeNextRunAt(job.schedule, new Date());
  }
  if (body.enabled === false) {
    patch.status = "disabled";
  }

  const updated = await updateScheduledJob(id, ctx.companyId, patch);
  return NextResponse.json({ job: updated });
});

export const DELETE = withErrorHandler(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  await softDeleteScheduledJob(id, ctx.companyId);
  return NextResponse.json({ ok: true });
});
