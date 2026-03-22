/**
 * GET/PATCH /api/user-preferences — Read and update UI preferences
 * (sidebar order, quick action mode, sidebar collapsed state).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db, userPreferences } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";

// ── GET ─────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, ctx.userId),
        eq(userPreferences.companyId, ctx.companyId)
      )
    )
    .limit(1);

  return NextResponse.json(prefs ?? { sidebarOrder: null, quickActionMode: "dynamic", sidebarCollapsed: false, customQuickActions: null });
});

// ── PATCH ───────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  sidebarOrder: z.array(z.string()).nullable().optional(),
  quickActionMode: z.enum(["intelligence", "dynamic", "custom"]).optional(),
  quickActionModeOverrides: z.record(z.enum(["intelligence", "dynamic", "custom"])).nullable().optional(),
  customQuickActions: z.array(z.string()).nullable().optional(),
  sidebarCollapsed: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const body = patchSchema.parse(await request.json());

  // Upsert — create if missing, update if exists
  const [existing] = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, ctx.userId),
        eq(userPreferences.companyId, ctx.companyId)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(userPreferences)
      .set(body)
      .where(eq(userPreferences.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(userPreferences)
    .values({
      userId: ctx.userId,
      companyId: ctx.companyId,
      ...body,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
});
