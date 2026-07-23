import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { updateSource, deleteSource } from "@burnless/db";
import { requireCompanyWrite, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";

const updateSourceSchema = z.object({
  url: z.string().url().optional(),
  config: z.unknown().optional(),
  enabled: z.boolean().optional(),
  intervalHours: z.number().int().positive().optional(),
});

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string; sid: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { sid } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const parsed = await parseBody(request, updateSourceSchema);
  if ("error" in parsed) return parsed.error;

  const source = await updateSource(sid, ctx.companyId, parsed.data);
  if (!source) return errorResponse("Source not found", 404);

  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ source });
});

export const DELETE = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string; sid: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { sid } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  await deleteSource(sid, ctx.companyId);
  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ ok: true });
});
