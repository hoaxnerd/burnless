import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createCompetitor, listCompetitors, createSource } from "@burnless/db";
import { requireCompanyAccess, requireCompanyWrite, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";

const createCompetitorSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  sources: z
    .array(
      z.object({
        type: z.enum(["pricing", "social", "page"]),
        url: z.string().url(),
        config: z.unknown().optional(),
      }),
    )
    .optional(),
});

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const competitors = await listCompetitors(ctx.companyId);
  return NextResponse.json({ competitors });
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const parsed = await parseBody(request, createCompetitorSchema);
  if ("error" in parsed) return parsed.error;

  const { name, url, sources } = parsed.data;
  const competitor = await createCompetitor({ companyId: ctx.companyId, name, url });

  if (sources && sources.length > 0) {
    for (const source of sources) {
      await createSource({
        companyId: ctx.companyId,
        competitorId: competitor.id,
        type: source.type,
        url: source.url,
        config: source.config,
      });
    }
  }

  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ competitor }, { status: 201 });
});
