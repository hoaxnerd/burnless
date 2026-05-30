import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db, fundingRounds, fundingRoundInvestors, listInvestorsForRound } from "@burnless/db";
import { and, eq } from "drizzle-orm";
import {
  requireCompanyAccess,
  requireRole,
  parseBody,
  errorResponse,
  withErrorHandler,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

const PostBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  amountInvested: z.number().positive(),
}).strict();

export const GET = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await context.params;
  const [round] = await db
    .select()
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, id), eq(fundingRounds.companyId, ctx.companyId)));
  if (!round) return errorResponse("Round not found", 404);
  return NextResponse.json({ investors: await listInvestorsForRound(id) });
});

export const POST = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await context.params;
  const parsed = await parseBody(request, PostBody);
  if ("error" in parsed) return parsed.error;

  const [round] = await db
    .select()
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, id), eq(fundingRounds.companyId, ctx.companyId)));
  if (!round) return errorResponse("Round not found", 404);

  const [inserted] = await db
    .insert(fundingRoundInvestors)
    .values({
      fundingRoundId: id,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      amountInvested: String(parsed.data.amountInvested),
    })
    .returning();
  if (!inserted) return errorResponse("Insert failed", 500);
  await logAudit(ctx, "funding_round_investor", inserted.id, "create", { after: inserted });
  revalidateTag("funding-rounds");
  revalidateTag("scenario-overrides");
  revalidateTag("cap-table");
  await trackDataMutation(ctx.companyId, "funding");
  return NextResponse.json({ investor: inserted }, { status: 201 });
});
