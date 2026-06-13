/**
 * PATCH/DELETE /api/ai-features/providers/[id] — update / delete a provider.
 * SELF-HOST ONLY (P2 #49): same gate chain as the collection route. Company-scoped
 * (404 on a foreign/missing id). Never returns secrets.
 */
import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireSelfManagedAi } from "@/lib/ai-providers/guard";
import { updateAiProvider, deleteAiProvider } from "@burnless/db";
import { updateProviderSchema } from "@/lib/ai-providers/schemas";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (request: Request, { params }: Params) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const gate = requireSelfManagedAi();
  if (gate) return gate;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;
  const parsed = updateProviderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid request body", 400);
  const provider = await updateAiProvider(id, ctx.companyId, parsed.data);
  if (!provider) return errorResponse("Provider not found", 404);
  return NextResponse.json({ provider });
});

export const DELETE = withErrorHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const gate = requireSelfManagedAi();
  if (gate) return gate;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;
  const ok = await deleteAiProvider(id, ctx.companyId);
  if (!ok) return errorResponse("Provider not found", 404);
  return NextResponse.json({ ok: true });
});
