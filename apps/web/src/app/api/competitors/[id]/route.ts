import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getCompetitor, updateCompetitor, deleteCompetitor } from "@burnless/db";
import { requireCompanyAccess, requireCompanyWrite, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";

const updateCompetitorSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  status: z.enum(["active", "paused"]).optional(),
});

export const GET = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const competitor = await getCompetitor(id, ctx.companyId);
  if (!competitor) return errorResponse("Competitor not found", 404);
  return NextResponse.json({ competitor });
});

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const parsed = await parseBody(request, updateCompetitorSchema);
  if ("error" in parsed) return parsed.error;

  const competitor = await updateCompetitor(id, ctx.companyId, parsed.data);
  if (!competitor) return errorResponse("Competitor not found", 404);

  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ competitor });
});

export const DELETE = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const existing = await getCompetitor(id, ctx.companyId);
  if (!existing) return errorResponse("Competitor not found", 404);

  await deleteCompetitor(id, ctx.companyId);
  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ ok: true });
});
