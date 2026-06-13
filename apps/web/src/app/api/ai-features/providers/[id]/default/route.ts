/**
 * POST /api/ai-features/providers/[id]/default — mark a provider as the company
 * default (single-default enforced in the query layer). SELF-HOST ONLY (P2 #49):
 * same gate chain as siblings. 404 on a foreign/missing id.
 */
import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireSelfManagedAi } from "@/lib/ai-providers/guard";
import { setDefaultAiProvider } from "@burnless/db";

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const gate = requireSelfManagedAi();
  if (gate) return gate;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;
  const ok = await setDefaultAiProvider(id, ctx.companyId);
  if (!ok) return errorResponse("Provider not found", 404);
  return NextResponse.json({ ok: true });
});
