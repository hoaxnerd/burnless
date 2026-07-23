import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { ackChange } from "@burnless/db";
import { requireCompanyWrite, withErrorHandler } from "@/lib/api-helpers";
import { requireDomainEnabled } from "@/lib/domain-gating";

export const POST = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) => {
  const ctx = await requireCompanyWrite();
  if ("error" in ctx) return ctx.error;
  const { cid } = await params;

  const gate = await requireDomainEnabled("competitor", { companyId: ctx.companyId });
  if (gate) return gate;

  await ackChange(cid, ctx.companyId, new Date());
  revalidateTag("competitors", { expire: 0 });
  return NextResponse.json({ ok: true });
});
