import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCompetitor, listSources, createSource } from "@burnless/db";
import { requireCompanyWrite, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";
import { discoverFeeds } from "@/lib/competitor/discover";

export const POST = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const competitor = await getCompetitor(id, ctx.companyId);
  if (!competitor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const found = await discoverFeeds(competitor.url);
  const existing = new Set(
    (await listSources(id, ctx.companyId)).map((s) => `${s.type}:${s.url}`),
  );
  let created = 0;
  for (const f of found) {
    if (existing.has(`${f.type}:${f.url}`)) continue;
    existing.add(`${f.type}:${f.url}`);
    await createSource({
      companyId: ctx.companyId,
      competitorId: id,
      type: f.type,
      url: f.url,
    });
    created++;
  }

  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ created });
});
