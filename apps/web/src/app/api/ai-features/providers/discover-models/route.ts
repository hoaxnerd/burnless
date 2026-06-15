/**
 * POST /api/ai-features/providers/discover-models — pre-save model discovery.
 *
 * Unlike /[id]/models/fetch (which needs a SAVED provider), this takes the
 * currently-entered {kind, baseUrl?, apiKey?} directly so the modal's "Fetch
 * models" button works in create-mode, before any provider/key is saved.
 * Keyless providers (OpenRouter / Ollama, and Anthropic's static catalog list)
 * return models with NO apiKey; key-required ones return a friendly,
 * user-safe message when no key is given. No DB writes — the client previews the
 * list and the chosen default is persisted on save.
 *
 * SELF-HOST ONLY (P2 #49): managedAiProvider OFF → allowed; ON (cloud) → 403.
 * Flow: requireCompanyAccess → requireSelfManagedAi → requireRole(admin).
 */
import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireSelfManagedAi } from "@/lib/ai-providers/guard";
import { fetchProviderModels, ModelDiscoveryError } from "@/lib/ai-providers/discovery";
import { discoverModelsSchema } from "@/lib/ai-providers/schemas";
import type { ProviderKind } from "@burnless/ai";

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const gate = requireSelfManagedAi();
  if (gate) return gate;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const parsed = discoverModelsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid request body", 400);

  try {
    const models = await fetchProviderModels({
      kind: parsed.data.kind as ProviderKind,
      baseUrl: parsed.data.baseUrl,
      apiKey: parsed.data.apiKey,
      headers: parsed.data.headers,
    });
    return NextResponse.json({ models, fetched: models.length });
  } catch (e) {
    // ModelDiscoveryError carries a user-safe message; default to a generic one
    // so we never surface a raw server/network error string.
    const message =
      e instanceof ModelDiscoveryError
        ? e.message
        : "Could not fetch models from the provider. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
