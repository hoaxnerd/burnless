import { NextResponse } from "next/server";
import { z } from "zod";
import { db, integrations } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { requireCapability } from "@/lib/capabilities";

// ── PATCH /api/integrations/[id] — Update integration status ────────────────

const updateSchema = z.object({
  status: z.enum(["active", "disconnected", "error"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const capErr = requireCapability("integrations");
  if (capErr) return capErr;

  const { id } = await params;
  const parsed = await parseBody(request, updateSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = {};
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.metadata) updates.metadata = parsed.data.metadata;
  if (parsed.data.status === "active") updates.lastSyncAt = new Date();

  const [updated] = await db
    .update(integrations)
    .set(updates)
    .where(
      and(eq(integrations.id, id), eq(integrations.companyId, ctx.companyId))
    )
    .returning();

  if (!updated) return errorResponse("Integration not found", 404);

  return NextResponse.json(updated);
});

// ── DELETE /api/integrations/[id] — Disconnect integration ──────────────────

export const DELETE = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const capErr = requireCapability("integrations");
  if (capErr) return capErr;

  const { id } = await params;

  const [deleted] = await db
    .delete(integrations)
    .where(
      and(eq(integrations.id, id), eq(integrations.companyId, ctx.companyId))
    )
    .returning();

  if (!deleted) return errorResponse("Integration not found", 404);

  return NextResponse.json({ success: true });
});
