import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireSelfManagedAi } from "@/lib/ai-providers/guard";
import { getAiProvider, getDecryptedProviderKey, addAiProviderModel, listAiProviderModels } from "@burnless/db";
import { fetchProviderModels } from "@/lib/ai-providers/discovery";
import type { ProviderKind } from "@burnless/ai";

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const gate = requireSelfManagedAi();
  if (gate) return gate;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;
  const provider = await getAiProvider(id, ctx.companyId);
  if (!provider) return errorResponse("Provider not found", 404);
  const apiKey = (await getDecryptedProviderKey(id, ctx.companyId)) ?? undefined;
  let discovered;
  try {
    discovered = await fetchProviderModels({
      kind: provider.kind as ProviderKind,
      baseUrl: provider.baseUrl,
      apiKey,
      headers: (provider.headers as Record<string, string> | null) ?? undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  for (const m of discovered) {
    await addAiProviderModel(id, { modelId: m.modelId, source: m.source });
  }
  const models = await listAiProviderModels(id);
  return NextResponse.json({ models, fetched: discovered.length });
});
