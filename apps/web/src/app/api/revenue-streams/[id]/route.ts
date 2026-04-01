import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { revenueStreams, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { updateRevenueStreamSchema } from "@burnless/types";
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

  const parsed = await parseBody(request, updateRevenueStreamSchema);
  if ("error" in parsed) return parsed.error;

  const row = await scenarioUpdate("revenue_stream", revenueStreams, id, parsed.data, scenarioId);
  if (!row) return errorResponse("Revenue stream not found", 404);
  await logAudit(ctx, "revenue_stream", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "revenue");
  revalidateTag("revenue-streams");
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

  await scenarioDelete("revenue_stream", revenueStreams, id, scenarioId);
  await logAudit(ctx, "revenue_stream", id, "delete", {});
  await trackDataMutation(ctx.companyId, "revenue");
  revalidateTag("revenue-streams");
  return NextResponse.json({ deleted: true });
});
