import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users, verificationTokens, inviteCodes, inviteCodeRedemptions } from "@burnless/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { hashPassword } from "@/lib/password";
import { email } from "@/lib/email";
import { verificationEmail } from "@/lib/email/templates";
import { withErrorHandler } from "@/lib/api-helpers";
import { requireCapability } from "@/lib/capabilities";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { logger } from "@/lib/logger";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().min(1).optional(),
  inviteCode: z.string().min(1).optional(),
});

export const POST = withErrorHandler(async (request: Request) => {
  // S4a — self-host is single-user: public signup is closed (additional users
  // come via the S5 CLI `users create`). Cloud keeps self-serve signup.
  const denied = requireCapability("selfServeSignup");
  if (denied) return denied;

  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  let body: z.infer<typeof registerSchema>;
  try {
    body = registerSchema.parse(await request.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      const message = e.errors.map((err) => err.message).join(". ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Check if user already exists
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(body.password);

  const [user] = await db
    .insert(users)
    .values({
      email: body.email,
      name: body.name ?? body.email.split("@")[0],
      passwordHash,
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  if (!user) {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }

  // Redeem invite code if provided
  let inviteRedemption: { freePlatformDays: number; aiCreditsCents: number } | null = null;
  if (body.inviteCode && user) {
    try {
      // Atomic redemption: SELECT + conditional UPDATE inside a single transaction
      // to prevent race conditions where concurrent requests over-redeem
      inviteRedemption = await db.transaction(async (tx) => {
        const [invite] = await tx
          .select()
          .from(inviteCodes)
          .where(eq(inviteCodes.code, body.inviteCode!))
          .limit(1);

        if (
          !invite ||
          !invite.isActive ||
          invite.currentRedemptions >= invite.maxRedemptions ||
          (invite.expiresAt && invite.expiresAt < new Date())
        ) {
          return null;
        }

        // Atomic increment with count guard — prevents over-redemption even under concurrency
        const [updated] = await tx
          .update(inviteCodes)
          .set({ currentRedemptions: sql`${inviteCodes.currentRedemptions} + 1` })
          .where(
            sql`${inviteCodes.id} = ${invite.id} AND ${inviteCodes.currentRedemptions} < ${inviteCodes.maxRedemptions}`
          )
          .returning({ id: inviteCodes.id });

        if (!updated) return null; // Another request got there first

        await tx.insert(inviteCodeRedemptions).values({
          inviteCodeId: invite.id,
          userId: user.id,
        });

        return {
          freePlatformDays: invite.freePlatformDays,
          aiCreditsCents: invite.aiCreditsCents,
        };
      });
    } catch (err) {
      logger("register").error("Failed to redeem invite code:", err);
      // Non-blocking — account creation succeeded even if invite fails
    }
  }

  // Send verification email — await token insert so we know verification is possible
  if (email.provider && user.email) {
    const normalizedEmail = user.email.toLowerCase().trim();
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + TOKEN_EXPIRY_MS);

    try {
      await db.insert(verificationTokens).values({
        identifier: `verify:${normalizedEmail}`,
        token,
        expires,
      });

      const verifyUrl = `${BASE_URL}/verify-email?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
      const template = verificationEmail(verifyUrl);
      // Email send is best-effort — token is persisted, user can re-request
      email.provider.send({ to: normalizedEmail, ...template }).catch((err: unknown) => {
        logger("email").error("Failed to send verification email:", err);
      });
    } catch (err) {
      logger("register").error("Failed to insert verification token:", err);
      return NextResponse.json(
        { error: "Account created but verification failed. Please request a new verification email." },
        { status: 201 }
      );
    }
  }

  return NextResponse.json(
    { ...user, ...(inviteRedemption ? { invite: inviteRedemption } : {}) },
    { status: 201 }
  );
});
