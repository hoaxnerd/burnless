import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, fundingRounds, fundingRoundInvestors } from "@burnless/db";
import { and, eq } from "drizzle-orm";
import {
  requireCompanyAccess,
  requireRole,
  errorResponse,
  withErrorHandler,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const DELETE = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string; investorId: string }> },
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id, investorId } = await context.params;

  const [round] = await db
    .select()
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, id), eq(fundingRounds.companyId, ctx.companyId)));
  if (!round) return errorResponse("Round not found", 404);

  await db
    .delete(fundingRoundInvestors)
    .where(
      and(
        eq(fundingRoundInvestors.id, investorId),
        eq(fundingRoundInvestors.fundingRoundId, id),
      ),
    );
  await logAudit(ctx, "funding_round_investor", investorId, "delete", {});
  revalidateTag("funding-rounds");
  revalidateTag("scenario-overrides");
  revalidateTag("cap-table");
  return NextResponse.json({ deleted: true });
});
