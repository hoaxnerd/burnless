import { NextResponse } from "next/server";
import { listChanges } from "@burnless/db";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";

export const GET = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : 50;

  const changes = await listChanges(ctx.companyId, { competitorId: id, limit });
  return NextResponse.json({ changes });
});
