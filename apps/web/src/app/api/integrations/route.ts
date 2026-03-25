import { NextResponse } from "next/server";
import { db, integrations } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { createIntegrationSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, requirePlanFeature, parseBody, withErrorHandler } from "@/lib/api-helpers";

// ── GET /api/integrations — List all integrations for company ───────────────

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.companyId, ctx.companyId));

  return NextResponse.json(rows);
});

// ── POST /api/integrations — Create/connect an integration ──────────────────

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  // Integrations require Team plan
  const planGate = await requirePlanFeature(ctx.companyId, "custom_integrations");
  if (planGate) return planGate;

  const parsed = await parseBody(request, createIntegrationSchema);
  if ("error" in parsed) return parsed.error;

  const { type, metadata } = parsed.data;

  // Check for existing integration of this type
  const [existing] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.companyId, ctx.companyId), eq(integrations.type, type)))
    .limit(1);

  // Upsert — reconnect if disconnected
  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        status: "active",
        lastSyncAt: new Date(),
        metadata: metadata ?? null,
      })
      .where(eq(integrations.id, existing.id))
      .returning();

    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(integrations)
    .values({
      companyId: ctx.companyId,
      type,
      status: "active",
      lastSyncAt: new Date(),
      metadata: metadata ?? null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
});
