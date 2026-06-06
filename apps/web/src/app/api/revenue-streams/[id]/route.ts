import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { revenueStreams, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { updateRevenueStreamSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";
import { validateTiers } from "@/lib/revenue-params";
import type { PricingTier } from "@burnless/engine";

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

  const streamParams = (parsed.data.parameters ?? {}) as Record<string, unknown>;
  if (Array.isArray(streamParams.tiers)) {
    try {
      validateTiers(streamParams.tiers as PricingTier[]);
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : "Invalid tiers", 400);
    }
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.startDate) patch.startDate = new Date(parsed.data.startDate);
  if (parsed.data.endDate !== undefined) {
    patch.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
  }

  const row = await scenarioUpdate("revenue_stream", revenueStreams, id, patch, scenarioId, ctx.companyId);
  if (!row) return errorResponse("Revenue stream not found", 404);
  await logAudit(ctx, "revenue_stream", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "revenue");
  revalidateTag("revenue-streams");
  revalidateTag("scenario-overrides"); // revenue-stream data is merged via scenario-overrides cache
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

  const ok = await scenarioDelete("revenue_stream", revenueStreams, id, scenarioId, ctx.companyId);
  if (!ok) return errorResponse("Revenue stream not found", 404);
  await logAudit(ctx, "revenue_stream", id, "delete", {});
  await trackDataMutation(ctx.companyId, "revenue");
  revalidateTag("revenue-streams");
  revalidateTag("scenario-overrides"); // revenue-stream data is merged via scenario-overrides cache
  return NextResponse.json({ deleted: true });
});
