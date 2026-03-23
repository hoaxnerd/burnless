/**
 * POST /api/ai-features/test-connection — Validate an AI provider API key.
 *
 * Sends a minimal completion request to verify the key works.
 * Does NOT persist anything — this is a dry-run validation.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { createProvider } from "@burnless/ai";

const bodySchema = z.object({
  provider: z.enum(["anthropic", "openai", "openrouter", "ollama"]),
  apiKey: z.string().min(1).max(256).optional(),
  model: z.string().max(128).optional(),
  baseUrl: z.string().url().max(512).optional(),
}).refine(
  (data) => data.provider === "ollama" || !!data.apiKey,
  { message: "API key is required for non-Ollama providers", path: ["apiKey"] }
);

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const provider = createProvider({
    provider: body.provider,
    apiKey: body.apiKey ?? (body.provider === "ollama" ? "ollama" : ""),
    model: body.model,
    baseUrl: body.baseUrl,
    maxTokens: 10,
  });

  if (!provider) {
    return NextResponse.json(
      { ok: false, error: "Failed to initialize provider" },
      { status: 400 }
    );
  }

  try {
    const response = await provider.complete({
      messages: [{ role: "user", content: "Say hi" }],
      maxTokens: 10,
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    return NextResponse.json({
      ok: true,
      model: body.model ?? body.provider,
      response: text.slice(0, 100),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    );
  }
});
