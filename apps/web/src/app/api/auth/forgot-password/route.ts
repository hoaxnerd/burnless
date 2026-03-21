import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users, verificationTokens } from "@burnless/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { email } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email/templates";
import { withErrorHandler } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const schema = z.object({
  email: z.string().email(),
});

export const POST = withErrorHandler(async (request: Request) => {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const normalizedEmail = body.email.toLowerCase().trim();

  // Always return 200 to prevent email enumeration
  const successResponse = NextResponse.json({
    message: "If an account exists with that email, a reset link has been sent.",
  });

  const [user] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  // No user, or OAuth-only user (no password) — return success silently
  if (!user || !user.passwordHash) {
    return successResponse;
  }

  // Generate a secure token
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Store token (identifier = email, following Auth.js convention)
  await db.insert(verificationTokens).values({
    identifier: normalizedEmail,
    token,
    expires,
  });

  // Send reset email
  const resetUrl = `${BASE_URL}/reset-password?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
  const template = passwordResetEmail(resetUrl);

  email.provider.send({ to: normalizedEmail, ...template }).catch((err) => {
    logger("email").error("Failed to send password reset email:", err);
  });

  return successResponse;
});
