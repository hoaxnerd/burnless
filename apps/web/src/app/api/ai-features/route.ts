/**
 * GET/PATCH /api/ai-features — Read and update AI feature flags for the
 * authenticated user's company.
 *
 * GET  → returns the current AiFeatureFlagsState + budget info
 * PATCH → updates master switch, data mode, budget, and/or individual feature toggles
 */

import { NextResponse } from "next/server";
import { db } from "@burnless/db";
import { aiFeatureFlags } from "@burnless/db";
import { eq } from "drizzle-orm";
import { updateAiFeaturesSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { DEFAULT_AI_FLAGS, type AiFeatureConfig } from "@burnless/ai";
import { initialAiMasterEnabled } from "@/lib/ai-default";
import { getCreditStatus } from "@/lib/ai-feature-flags";

// ── GET ─────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const flags = await getOrCreateFlags(ctx.companyId);
  const credits = await getCreditStatus(ctx.companyId);
  return NextResponse.json({ ...flags, credits });
});

// ── PATCH ───────────────────────────────────────────────────────────────────

export const PATCH = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Only admins+ can change AI settings
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  let body: import("@burnless/types").UpdateAiFeaturesInput;
  try {
    body = updateAiFeaturesSchema.parse(await request.json());
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
  if (body.writeMode !== undefined) {
    updates.writeMode = body.writeMode;
  }
  if (body.features) {
    updates.features = {
      ...(existing.features as AiFeatureConfig),
      ...body.features,
    };
  }
  if (body.companionName !== undefined) {
    updates.companionName = body.companionName;
  }
  // BYOK toggle
  if (body.byokEnabled !== undefined) updates.byokEnabled = body.byokEnabled;
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

  const credits = await getCreditStatus(ctx.companyId);

  return NextResponse.json({
    masterEnabled: updated.masterEnabled,
    dataMode: updated.dataMode,
    writeMode: updated.writeMode,
    features: updated.features,
    companionName: updated.companionName ?? DEFAULT_AI_FLAGS.companionName,
    byokEnabled: updated.byokEnabled,
    aiProvider: updated.aiProvider,
    aiApiKey: maskApiKey(updated.aiApiKey),
    aiModel: updated.aiModel,
    aiBaseUrl: updated.aiBaseUrl,
    credits,
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
      writeMode: (existing.writeMode ?? "confirm") as "full" | "confirm" | "read_only",
      features: existing.features as AiFeatureConfig,
      companionName: existing.companionName ?? DEFAULT_AI_FLAGS.companionName,
      byokEnabled: existing.byokEnabled,
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
      masterEnabled: initialAiMasterEnabled(),
      dataMode: DEFAULT_AI_FLAGS.dataMode,
      writeMode: DEFAULT_AI_FLAGS.writeMode,
      features: DEFAULT_AI_FLAGS.features,
    })
    .returning();

  return {
    masterEnabled: created?.masterEnabled ?? DEFAULT_AI_FLAGS.masterEnabled,
    dataMode: (created?.dataMode ?? DEFAULT_AI_FLAGS.dataMode) as "full" | "show_cached" | "hide_all",
    writeMode: (created?.writeMode ?? DEFAULT_AI_FLAGS.writeMode) as "full" | "confirm" | "read_only",
    features: (created?.features ?? DEFAULT_AI_FLAGS.features) as AiFeatureConfig,
    companionName: created?.companionName ?? DEFAULT_AI_FLAGS.companionName,
    byokEnabled: created?.byokEnabled ?? false,
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
