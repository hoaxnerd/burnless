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

  // Find the invite code
  const [invite] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, code))
    .limit(1);

  if (!invite) {
    return NextResponse.json(
      { error: "Invalid invite code" },
      { status: 404 }
    );
  }

  // Validate the invite code
  if (!invite.isActive) {
    return NextResponse.json(
      { error: "This invite code has been deactivated" },
      { status: 410 }
    );
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invite code has expired" },
      { status: 410 }
    );
  }

  if (invite.currentRedemptions >= invite.maxRedemptions) {
    return NextResponse.json(
      { error: "This invite code has reached its maximum redemptions" },
      { status: 410 }
    );
  }

  // Check if user already redeemed this code
  const [existingRedemption] = await db
    .select({ id: inviteCodeRedemptions.id })
    .from(inviteCodeRedemptions)
    .where(
      and(
        eq(inviteCodeRedemptions.inviteCodeId, invite.id),
        eq(inviteCodeRedemptions.userId, userId)
      )
    )
    .limit(1);

  if (existingRedemption) {
    return NextResponse.json(
      { error: "You have already redeemed this invite code" },
      { status: 409 }
    );
  }

  // Redeem: insert redemption record + increment counter atomically
  await db.transaction(async (tx) => {
    await tx.insert(inviteCodeRedemptions).values({
      inviteCodeId: invite.id,
      userId,
    });

    await tx
      .update(inviteCodes)
      .set({
        currentRedemptions: sql`${inviteCodes.currentRedemptions} + 1`,
      })
      .where(eq(inviteCodes.id, invite.id));
  });

  return NextResponse.json({
    success: true,
    freePlatformDays: invite.freePlatformDays,
    aiCreditsCents: invite.aiCreditsCents,
  });
});
