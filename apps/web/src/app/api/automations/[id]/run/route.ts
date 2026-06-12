// apps/web/src/app/api/automations/[id]/run/route.ts
import { NextResponse } from "next/server";
import { getScheduledJob } from "@burnless/db";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { runScheduledJob } from "@/lib/automations/runner";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const job = await getScheduledJob(id, ctx.companyId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const outcome = await runScheduledJob(id, "manual");
  return NextResponse.json({ run: outcome.run, status: outcome.status, result: outcome.result });
});
