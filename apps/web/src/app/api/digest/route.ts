/**
 * GET /api/digest — returns the latest weekly digest for the current company.
 * POST /api/digest — dismiss a digest.
 */

import { NextResponse } from "next/server";
import { db, weeklyDigests } from "@burnless/db";
import { eq, desc, and, isNull } from "drizzle-orm";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx && ctx.error) return ctx.error;

  const [digest] = await db
    .select()
    .from(weeklyDigests)
    .where(
      and(
        eq(weeklyDigests.companyId, ctx.companyId),
        isNull(weeklyDigests.dismissedAt)
      )
    )
    .orderBy(desc(weeklyDigests.weekStart))
    .limit(1);

  if (!digest) {
    return NextResponse.json({ digest: null });
  }

  return NextResponse.json({ digest });
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx && ctx.error) return ctx.error;

  const body = await request.json();
  const { action, digestId } = body as { action: string; digestId: string };

  if (action === "dismiss" && digestId) {
    await db
      .update(weeklyDigests)
      .set({ dismissedAt: new Date() })
      .where(
        and(
          eq(weeklyDigests.id, digestId),
          eq(weeklyDigests.companyId, ctx.companyId)
        )
      );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});
