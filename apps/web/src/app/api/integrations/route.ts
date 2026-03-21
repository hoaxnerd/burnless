import { NextResponse } from "next/server";
import { z } from "zod";
import { db, integrations } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse } from "@/lib/api-helpers";

// ── GET /api/integrations — List all integrations for company ───────────────

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.companyId, ctx.companyId));

  return NextResponse.json(rows);
}

// ── POST /api/integrations — Create/connect an integration ──────────────────

const createSchema = z.object({
  type: z.enum([
    "quickbooks",
    "xero",
    "freshbooks",
    "plaid",
    "mercury",
    "gusto",
    "stripe",
  ]),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createSchema);
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
}
