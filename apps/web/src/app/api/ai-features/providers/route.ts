/**
 * GET/POST /api/ai-features/providers — list and create DB-backed AI providers.
 * SELF-HOST ONLY (P2 #49): managedAiProvider OFF → allowed; ON (cloud) → 403.
 * Flow: requireCompanyAccess → requireSelfManagedAi (inverse cap gate) →
 * requireRole(admin). Never returns secrets (listAiProviders omits the key,
 * exposing only apiKeySet).
 */
import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireSelfManagedAi } from "@/lib/ai-providers/guard";
import { listAiProviders, createAiProvider } from "@burnless/db";
import { createProviderSchema } from "@/lib/ai-providers/schemas";

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const gate = requireSelfManagedAi();
  if (gate) return gate;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const providers = await listAiProviders(ctx.companyId);
  return NextResponse.json({ providers });
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const gate = requireSelfManagedAi();
  if (gate) return gate;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const parsed = createProviderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid request body", 400);
  // The kind enum is validated against listCatalogKinds() but typed as a plain
  // string (the enum is built dynamically); the catalog kinds ARE exactly the
  // ProviderKind union, so the createAiProvider parameter cast is sound.
  const { kind, ...rest } = parsed.data;
  const provider = await createAiProvider({
    companyId: ctx.companyId,
    kind: kind as Parameters<typeof createAiProvider>[0]["kind"],
    ...rest,
  });
  return NextResponse.json({ provider }, { status: 201 });
});
