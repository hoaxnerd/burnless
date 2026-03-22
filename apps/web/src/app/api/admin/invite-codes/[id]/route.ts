import { NextResponse } from "next/server";
import { z } from "zod";
import { db, inviteCodes } from "@burnless/db";
import { eq } from "drizzle-orm";
import {
  requireCompanyAccess,
  requireRole,
  withErrorHandler,
  parseBody,
} from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  maxRedemptions: z.number().int().min(1).max(10000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  freePlatformDays: z.number().int().min(0).max(365).optional(),
  aiCreditsCents: z.number().int().min(0).max(100000).optional(),
  note: z.string().max(500).nullable().optional(),
});

// PATCH /api/admin/invite-codes/:id — update/deactivate code
export const PATCH = withErrorHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const blocked = await applyRateLimit(request, "mutation");
    if (blocked) return blocked;

    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;

    const roleErr = requireRole(ctx, "admin");
    if (roleErr) return roleErr;

    const { id } = await params;

    const parsed = await parseBody(request, updateSchema);
    if ("error" in parsed) return parsed.error;

    const { data } = parsed;
    const updates: Record<string, unknown> = {};

    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.maxRedemptions !== undefined)
      updates.maxRedemptions = data.maxRedemptions;
    if (data.expiresAt !== undefined)
      updates.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (data.freePlatformDays !== undefined)
      updates.freePlatformDays = data.freePlatformDays;
    if (data.aiCreditsCents !== undefined)
      updates.aiCreditsCents = data.aiCreditsCents;
    if (data.note !== undefined) updates.note = data.note;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(inviteCodes)
      .set(updates)
      .where(eq(inviteCodes.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Invite code not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  }
);

// DELETE /api/admin/invite-codes/:id — deactivate code (soft delete)
export const DELETE = withErrorHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const blocked = await applyRateLimit(request, "mutation");
    if (blocked) return blocked;

    const ctx = await requireCompanyAccess();
    if ("error" in ctx) return ctx.error;

    const roleErr = requireRole(ctx, "admin");
    if (roleErr) return roleErr;

    const { id } = await params;

    const [updated] = await db
      .update(inviteCodes)
      .set({ isActive: false })
      .where(eq(inviteCodes.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Invite code not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  }
);
