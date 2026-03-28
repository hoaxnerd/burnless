import { NextResponse } from "next/server";
import { z } from "zod";
import { db, inviteCodes, inviteCodeRedemptions } from "@burnless/db";
import { eq, and, sql } from "drizzle-orm";
import { withErrorHandler, parseBody } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";

const redeemSchema = z.object({
  code: z.string().min(1),
  userId: z.string().min(1),
});

/**
 * POST /api/auth/redeem-invite
 * Validate and redeem an invite code for a newly registered user.
 * Called internally after successful registration — not directly by the client.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  const parsed = await parseBody(request, redeemSchema);
  if ("error" in parsed) return parsed.error;

  const { code, userId } = parsed.data;

  // Atomic redemption: all validation + mutation inside a single transaction
  // to prevent race conditions where concurrent requests over-redeem
  const result = await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, code))
      .limit(1);

    if (!invite) return { error: "Invalid invite code", status: 404 as const };
    if (!invite.isActive) return { error: "This invite code has been deactivated", status: 410 as const };
    if (invite.expiresAt && invite.expiresAt < new Date()) return { error: "This invite code has expired", status: 410 as const };
    if (invite.currentRedemptions >= invite.maxRedemptions) return { error: "This invite code has reached its maximum redemptions", status: 410 as const };

    // Check if user already redeemed this code
    const [existingRedemption] = await tx
      .select({ id: inviteCodeRedemptions.id })
      .from(inviteCodeRedemptions)
      .where(
        and(
          eq(inviteCodeRedemptions.inviteCodeId, invite.id),
          eq(inviteCodeRedemptions.userId, userId)
        )
      )
      .limit(1);

    if (existingRedemption) return { error: "You have already redeemed this invite code", status: 409 as const };

    // Atomic increment with count guard — prevents over-redemption even under concurrency
    const [updated] = await tx
      .update(inviteCodes)
      .set({ currentRedemptions: sql`${inviteCodes.currentRedemptions} + 1` })
      .where(
        sql`${inviteCodes.id} = ${invite.id} AND ${inviteCodes.currentRedemptions} < ${inviteCodes.maxRedemptions}`
      )
      .returning({ id: inviteCodes.id });

    if (!updated) return { error: "This invite code has reached its maximum redemptions", status: 410 as const };

    await tx.insert(inviteCodeRedemptions).values({
      inviteCodeId: invite.id,
      userId,
    });

    return {
      success: true,
      freePlatformDays: invite.freePlatformDays,
      aiCreditsCents: invite.aiCreditsCents,
    };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
});
