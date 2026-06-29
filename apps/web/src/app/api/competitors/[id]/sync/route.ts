import { NextResponse } from "next/server";
import { listSources } from "@burnless/db";
import { requireCompanyWrite, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";
import { runSource } from "@/lib/competitor/pipeline";

export const POST = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  const sources = await listSources(id, ctx.companyId);
  const enabled = sources.filter((s) => s.enabled);

  let changed = 0;
  for (const s of enabled) {
    const r = await runSource(s);
    if (r.changed) changed++;
  }

  return NextResponse.json({ ran: enabled.length, changed });
});
