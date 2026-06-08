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

  // SHELL-01: atomic upsert. The shell fires multiple concurrent fire-and-forget
  // PATCHes on first write; a SELECT-then-INSERT races and the loser 500s on the
  // unique (userId, companyId) index. onConflictDoUpdate is a single atomic
  // statement that never collides. `set: body` only updates the provided keys, so
  // partial-PATCH semantics are preserved (unset columns keep their stored value).
  const [upserted] = await db
    .insert(userPreferences)
    .values({
      userId: ctx.userId,
      companyId: ctx.companyId,
      ...body,
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.companyId],
      set: body,
    })
    .returning();
  return NextResponse.json(upserted);
});
