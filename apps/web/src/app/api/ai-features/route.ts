/**
 * GET/PATCH /api/ai-features — Read and update AI feature flags for the
 * authenticated user's company.
 *
 * GET  → returns the current AiFeatureFlagsState + budget info
 * PATCH → updates master switch, data mode, budget, and/or individual feature toggles
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@burnless/db";
import { aiFeatureFlags } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { DEFAULT_AI_FLAGS, type AiFeatureConfig } from "@burnless/ai";
import { getBudgetStatus } from "@/lib/ai-feature-flags";

// ── GET ─────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const flags = await getOrCreateFlags(ctx.companyId);
  const budget = await getBudgetStatus(ctx.companyId);
  return NextResponse.json({ ...flags, budget });
});

// ── PATCH ───────────────────────────────────────────────────────────────────

const VALID_PROVIDERS = ["anthropic", "openai", "openrouter"] as const;

const patchSchema = z.object({
  masterEnabled: z.boolean().optional(),
  dataMode: z.enum(["full", "show_cached", "hide_all"]).optional(),
  monthlyBudgetCents: z.number().int().min(0).max(1_000_000).optional(), // $0 – $10,000
  features: z
    .object({
      onboarding: z.boolean().optional(),
      chat: z.boolean().optional(),
      insights: z.boolean().optional(),
      uiPersonalization: z.boolean().optional(),
      autoCategorization: z.boolean().optional(),
    })
    .optional(),
  // Provider config
  aiProvider: z.enum(VALID_PROVIDERS).nullable().optional(),
  aiApiKey: z.string().max(256).nullable().optional(),
  aiModel: z.string().max(128).nullable().optional(),
  aiBaseUrl: z.string().url().max(512).nullable().optional(),
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Only admins+ can change AI settings
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  const existing = await getOrCreateFlags(ctx.companyId);

  const updates: Record<string, unknown> = {};
  if (body.masterEnabled !== undefined) {
    updates.masterEnabled = body.masterEnabled;
  }
  if (body.dataMode !== undefined) {
    updates.dataMode = body.dataMode;
  }
  if (body.monthlyBudgetCents !== undefined) {
    updates.monthlyBudgetCents = body.monthlyBudgetCents;
  }
  if (body.features) {
    updates.features = {
      ...(existing.features as AiFeatureConfig),
      ...body.features,
    };
  }
  // Provider config — null clears to env-var fallback
  if (body.aiProvider !== undefined) updates.aiProvider = body.aiProvider;
  if (body.aiApiKey !== undefined) updates.aiApiKey = body.aiApiKey;
  if (body.aiModel !== undefined) updates.aiModel = body.aiModel;
  if (body.aiBaseUrl !== undefined) updates.aiBaseUrl = body.aiBaseUrl;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const [updated] = await db
    .update(aiFeatureFlags)
    .set(updates)
    .where(eq(aiFeatureFlags.companyId, ctx.companyId))
    .returning();

  if (!updated) {
    return errorResponse("Failed to update AI feature flags", 500);
  }

  const budget = await getBudgetStatus(ctx.companyId);

  return NextResponse.json({
    masterEnabled: updated.masterEnabled,
    dataMode: updated.dataMode,
    features: updated.features,
    monthlyBudgetCents: updated.monthlyBudgetCents,
    aiProvider: updated.aiProvider,
    aiApiKey: maskApiKey(updated.aiApiKey),
    aiModel: updated.aiModel,
    aiBaseUrl: updated.aiBaseUrl,
    budget,
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateFlags(companyId: string) {
  const [existing] = await db
    .select()
    .from(aiFeatureFlags)
    .where(eq(aiFeatureFlags.companyId, companyId))
    .limit(1);

  if (existing) {
    return {
      masterEnabled: existing.masterEnabled,
      dataMode: existing.dataMode as "full" | "show_cached" | "hide_all",
      features: existing.features as AiFeatureConfig,
      monthlyBudgetCents: existing.monthlyBudgetCents,
      aiProvider: existing.aiProvider,
      aiApiKey: maskApiKey(existing.aiApiKey),
      aiModel: existing.aiModel,
      aiBaseUrl: existing.aiBaseUrl,
    };
  }

  // Create default flags
  const [created] = await db
    .insert(aiFeatureFlags)
    .values({
      companyId,
      masterEnabled: DEFAULT_AI_FLAGS.masterEnabled,
      dataMode: DEFAULT_AI_FLAGS.dataMode,
      features: DEFAULT_AI_FLAGS.features,
    })
    .returning();

  return {
    masterEnabled: created?.masterEnabled ?? DEFAULT_AI_FLAGS.masterEnabled,
    dataMode: (created?.dataMode ?? DEFAULT_AI_FLAGS.dataMode) as "full" | "show_cached" | "hide_all",
    features: (created?.features ?? DEFAULT_AI_FLAGS.features) as AiFeatureConfig,
    monthlyBudgetCents: created?.monthlyBudgetCents ?? 5000,
    aiProvider: null,
    aiApiKey: null,
    aiModel: null,
    aiBaseUrl: null,
  };
}

/** Mask an API key for safe display — show first 4 + last 4 chars. */
function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 12) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}
