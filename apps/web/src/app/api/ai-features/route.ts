/**
 * GET/PATCH /api/ai-features — Read and update AI feature flags for the
 * authenticated user's company.
 *
 * GET  → returns the current AiFeatureFlagsState (creates defaults if none exist)
 * PATCH → updates master switch, data mode, and/or individual feature toggles
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@burnless/db";
import { aiFeatureFlags } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, errorResponse } from "@/lib/api-helpers";
import { DEFAULT_AI_FLAGS, type AiFeatureConfig } from "@burnless/ai";

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const flags = await getOrCreateFlags(ctx.companyId);
  return NextResponse.json(flags);
}

// ── PATCH ───────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  masterEnabled: z.boolean().optional(),
  dataMode: z.enum(["full", "show_cached", "hide_all"]).optional(),
  features: z
    .object({
      onboarding: z.boolean().optional(),
      chat: z.boolean().optional(),
      insights: z.boolean().optional(),
      uiPersonalization: z.boolean().optional(),
      autoCategorization: z.boolean().optional(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
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
  if (body.features) {
    updates.features = {
      ...(existing.features as AiFeatureConfig),
      ...body.features,
    };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const [updated] = await db
    .update(aiFeatureFlags)
    .set(updates)
    .where(eq(aiFeatureFlags.companyId, ctx.companyId))
    .returning();

  return NextResponse.json({
    masterEnabled: updated!.masterEnabled,
    dataMode: updated!.dataMode,
    features: updated!.features,
  });
}

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
    masterEnabled: created!.masterEnabled,
    dataMode: created!.dataMode as "full" | "show_cached" | "hide_all",
    features: created!.features as AiFeatureConfig,
  };
}
