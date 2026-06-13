import { NextResponse } from "next/server";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireSelfManagedAi } from "@/lib/ai-providers/guard";
import { getAiProvider, getDecryptedProviderKey, getResolvedDefaultModelId } from "@burnless/db";
import { createProvider } from "@burnless/ai";

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
  const apiKey = (await getDecryptedProviderKey(id, ctx.companyId)) ?? (provider.kind === "ollama" ? "ollama" : "");
  const model = (await getResolvedDefaultModelId(id)) ?? undefined;
  const llm = createProvider({ provider: provider.kind, apiKey, model, baseUrl: provider.baseUrl ?? undefined, maxTokens: 10 });
  if (!llm) return NextResponse.json({ ok: false, error: "Failed to initialize provider" }, { status: 400 });
  try {
    const response = await llm.complete({ messages: [{ role: "user", content: "Say hi" }], maxTokens: 10 });
    const text = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");
    return NextResponse.json({ ok: true, model: model ?? provider.kind, response: text.slice(0, 100) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 400 });
  }
});
