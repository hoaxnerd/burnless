import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { listSources, createSource } from "@burnless/db";
import { requireCompanyAccess, requireCompanyWrite, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";

const createSourceSchema = z.object({
  type: z.enum(["pricing", "social", "page"]),
  url: z.string().url(),
  config: z.unknown().optional(),
  intervalHours: z.number().int().positive().optional(),
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

  const sources = await listSources(id, ctx.companyId);
  return NextResponse.json({ sources });
});

export const POST = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const parsed = await parseBody(request, createSourceSchema);
  if ("error" in parsed) return parsed.error;

  const { type, url, config, intervalHours } = parsed.data;
  const source = await createSource({
    companyId: ctx.companyId,
    competitorId: id,
    type,
    url,
    config,
    intervalHours,
  });

  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ source }, { status: 201 });
});
