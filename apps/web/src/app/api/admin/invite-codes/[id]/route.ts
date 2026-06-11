import { NextResponse } from "next/server";
import { z } from "zod";
import { db, inviteCodes, inviteCodeRedemptions } from "@burnless/db";
import { eq, sql } from "drizzle-orm";
import {
  requireCompanyAccess,
  requireRole,
  withErrorHandler,
  parseBody,
} from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { requireCapability } from "@/lib/capabilities";

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

    const capErr = requireCapability("inviteCodes");
    if (capErr) return capErr;

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

// DELETE /api/admin/invite-codes/:id — hard-delete ONLY when the code has zero
// redemptions (SET-09). The FK on invite_code_redemptions is ON DELETE CASCADE,
// so deleting a redeemed code would silently erase its redemption history — hence
// the zero-redemption guard: redeemed codes return 409 and stay (deactivate via
// PATCH isActive:false instead).
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

    const capErr = requireCapability("inviteCodes");
    if (capErr) return capErr;

    const { id } = await params;

    // Confirm the code exists first (so we can 404 vs 409 correctly).
    const [existing] = await db
      .select({ id: inviteCodes.id })
      .from(inviteCodes)
      .where(eq(inviteCodes.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Invite code not found" },
        { status: 404 }
      );
    }

    // Count redemptions — block the hard-delete if any exist.
    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inviteCodeRedemptions)
      .where(eq(inviteCodeRedemptions.inviteCodeId, id));
    const redemptionCount = countRows[0]?.count ?? 0;

    if (redemptionCount > 0) {
      return NextResponse.json(
        {
          error:
            "This code has been redeemed and can't be deleted. Deactivate it instead to keep its redemption history.",
          code: "INVITE_CODE_HAS_REDEMPTIONS",
        },
        { status: 409 }
      );
    }

    await db.delete(inviteCodes).where(eq(inviteCodes.id, id));

    return NextResponse.json({ success: true });
  }
);
