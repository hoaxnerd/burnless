/**
 * GET/PATCH /api/dashboard-preferences — Read and update dashboard layout,
 * mode, card configuration, and custom metrics.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db, dashboardPreferences } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, withErrorHandler, parseBody } from "@/lib/api-helpers";
import { DEFAULT_HERO_CARDS, DEFAULT_SECONDARY_METRICS } from "@burnless/engine";

// ── GET ─────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const [prefs] = await db
    .select()
    .from(dashboardPreferences)
    .where(
      and(
        eq(dashboardPreferences.userId, ctx.userId),
        eq(dashboardPreferences.companyId, ctx.companyId)
      )
    )
    .limit(1);

  // Return defaults if no preferences saved yet
  const data = prefs ?? {
    mode: "dynamic" as const,
    heroCards: DEFAULT_HERO_CARDS,
    secondaryMetrics: DEFAULT_SECONDARY_METRICS,
    cardModeOverrides: {} as Record<string, string>,
    cardScenarioOverrides: {},
    customMetrics: [],
    layout: [],
    closedWidgets: [],
    pageLayouts: {},
  };

  // Compute whether any card uses Intelligence mode — server-side equivalent
  // of the client-side hasIntelligenceCards in dashboard-intelligence-context.tsx.
  // Used to gate AI card processing: when false, no Intelligence pipeline runs.
  const overrides = (data.cardModeOverrides ?? {}) as Record<string, string>;
  const hasIntelligenceCards = data.mode === "intelligence"
    ? Object.values(overrides).filter((m) => m !== "intelligence").length <
      ((data.heroCards as string[])?.length ?? 0) + ((data.secondaryMetrics as string[])?.length ?? 0)
    : Object.values(overrides).some((m) => m === "intelligence");

  return NextResponse.json({ ...data, hasIntelligenceCards });
});

// ── PATCH ───────────────────────────────────────────────────────────────────

const patchSchema = z.object({
  mode: z.enum(["intelligence", "dynamic", "custom"]).optional(),
  heroCards: z.array(z.string()).max(8).optional(),
  secondaryMetrics: z.array(z.string()).max(20).optional(),
  cardModeOverrides: z.record(z.string(), z.enum(["intelligence", "dynamic", "custom"])).optional(),
  cardScenarioOverrides: z.record(z.string(), z.string()).optional(),
  layout: z
    .array(
      z.object({
        widgetId: z.string(),
        x: z.number().int().min(0).max(12).optional().default(0),
        y: z.number().int().min(0).max(200).optional().default(0),
        w: z.number().int().min(1).max(12),
        h: z.number().int().min(1).max(50),
        autoH: z.boolean().optional(),
      })
    )
    .max(30)
    .optional(),
  customMetrics: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100),
        formula: z.string().min(1).max(500),
        dependsOn: z.array(z.string()),
      })
    )
    .max(20)
    .optional(),
  closedWidgets: z.array(z.string()).max(20).optional(),
  pageLayouts: z
    .record(
      z.string(),
      z.object({
        layout: z
          .array(
            z.object({
              widgetId: z.string(),
              x: z.number().int().min(0).max(12).optional().default(0),
              y: z.number().int().min(0).max(200).optional().default(0),
              w: z.number().int().min(1).max(12),
              h: z.number().int().min(1).max(50),
              autoH: z.boolean().optional(),
            })
          )
          .max(30),
        closedWidgets: z.array(z.string()).max(20).optional(),
      })
    )
    .optional(),
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // Upsert — create if missing, update if exists
  const [existing] = await db
    .select({ id: dashboardPreferences.id })
    .from(dashboardPreferences)
    .where(
      and(
        eq(dashboardPreferences.userId, ctx.userId),
        eq(dashboardPreferences.companyId, ctx.companyId)
      )
    )
    .limit(1);

  if (existing) {
    // Merge pageLayouts: new pages are added/updated, existing pages are preserved
    const setData = { ...body } as Record<string, unknown>;
    if (body.pageLayouts) {
      const [current] = await db
        .select({ pageLayouts: dashboardPreferences.pageLayouts })
        .from(dashboardPreferences)
        .where(eq(dashboardPreferences.id, existing.id))
        .limit(1);
      setData.pageLayouts = { ...(current?.pageLayouts ?? {}), ...body.pageLayouts };
    }
    const [updated] = await db
      .update(dashboardPreferences)
      .set(setData)
      .where(eq(dashboardPreferences.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(dashboardPreferences)
    .values({
      userId: ctx.userId,
      companyId: ctx.companyId,
      heroCards: body.heroCards ?? DEFAULT_HERO_CARDS,
      secondaryMetrics: body.secondaryMetrics ?? DEFAULT_SECONDARY_METRICS,
      ...body,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
});
