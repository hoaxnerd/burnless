import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { headcountPlans, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { updateHeadcountSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await params;

  const scenarioId = getActiveScenario(request);

  const parsed = await parseBody(request, updateHeadcountSchema);
  if ("error" in parsed) return parsed.error;

  const changes: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.salary !== undefined) changes.salary = String(parsed.data.salary);
  if (parsed.data.benefitsRate !== undefined) changes.benefitsRate = String(parsed.data.benefitsRate);
  if (parsed.data.count !== undefined) changes.count = parsed.data.count.toFixed(2);
  if (parsed.data.hourlyRate !== undefined) {
    changes.hourlyRate = parsed.data.hourlyRate === null ? null : String(parsed.data.hourlyRate);
  }
  if (parsed.data.hoursPerWeek !== undefined) {
    changes.hoursPerWeek = parsed.data.hoursPerWeek === null ? null : String(parsed.data.hoursPerWeek);
  }

  const row = await scenarioUpdate("headcount_plan", headcountPlans, id, changes, scenarioId, ctx.companyId);
  if (!row) return errorResponse("Headcount plan not found", 404);
  await logAudit(ctx, "headcount_plan", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 }); // Phase 4 A §A1 — tag parity with data.ts
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;

  const scenarioId = getActiveScenario(request);

  const ok = await scenarioDelete("headcount_plan", headcountPlans, id, scenarioId, ctx.companyId);
  if (!ok) return errorResponse("Headcount plan not found", 404);
  await logAudit(ctx, "headcount_plan", id, "delete", {});
  await trackDataMutation(ctx.companyId, "headcount");
  revalidateTag("headcount-plans", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 }); // Phase 4 A §A1 — tag parity with data.ts
  return NextResponse.json({ deleted: true });
});
