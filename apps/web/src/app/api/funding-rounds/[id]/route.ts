import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, fundingRounds } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { updateFundingRoundSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

export const PATCH = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const parsed = await parseBody(request, updateFundingRoundSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.amount !== undefined) updates.amount = String(parsed.data.amount);
  if (parsed.data.preMoneyValuation !== undefined)
    updates.preMoneyValuation = parsed.data.preMoneyValuation != null ? String(parsed.data.preMoneyValuation) : null;
  if (parsed.data.dilutionPercent !== undefined)
    updates.dilutionPercent = parsed.data.dilutionPercent != null ? String(parsed.data.dilutionPercent) : null;

  const [row] = await db.update(fundingRounds).set(updates).where(and(eq(fundingRounds.id, id), eq(fundingRounds.companyId, ctx.companyId))).returning();
  if (!row) return errorResponse("Funding round not found", 404);
  await logAudit(ctx, "funding_round", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("funding-rounds");
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const [row] = await db.delete(fundingRounds).where(and(eq(fundingRounds.id, id), eq(fundingRounds.companyId, ctx.companyId))).returning();
  if (!row) return errorResponse("Funding round not found", 404);
  await logAudit(ctx, "funding_round", id, "delete", { before: row });
  await trackDataMutation(ctx.companyId, "funding");
  revalidateTag("funding-rounds");
  return NextResponse.json({ deleted: true });
});
