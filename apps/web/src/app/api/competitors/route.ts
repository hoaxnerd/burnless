import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createCompetitor, listCompetitors, createSource } from "@burnless/db";
import { requireCompanyAccess, requireCompanyWrite, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";
import { discoverFeeds } from "@/lib/competitor/discover";

const createCompetitorSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  sources: z
    .array(
      z.object({
        type: z.enum(["pricing", "social", "page", "feed", "sitemap"]),
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

  // Best-effort: deterministically discover feed/sitemap sources. Never blocks
  // creation — a discovery failure leaves the competitor with its explicit sources.
  try {
    const found = await discoverFeeds(competitor.url);
    const existing = new Set((sources ?? []).map((s) => `${s.type}:${s.url}`));
    for (const f of found) {
      if (existing.has(`${f.type}:${f.url}`)) continue;
      existing.add(`${f.type}:${f.url}`);
      await createSource({
        companyId: ctx.companyId,
        competitorId: competitor.id,
        type: f.type,
        url: f.url,
      });
    }
  } catch {
    /* discovery is best-effort */
  }

  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ competitor }, { status: 201 });
});
