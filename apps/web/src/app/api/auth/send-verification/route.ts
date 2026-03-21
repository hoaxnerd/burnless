import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users, verificationTokens } from "@burnless/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { email } from "@/lib/email";
import { verificationEmail } from "@/lib/email/templates";
import { withErrorHandler } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    message: "If an account exists with that email, a verification link has been sent.",
  });

  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  // No user or already verified — return success silently
  if (!user || user.emailVerified) {
    return successResponse;
  }

  // Clean up any existing verification tokens for this email
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, `verify:${normalizedEmail}`));

  // Generate a secure token
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Store token with "verify:" prefix to distinguish from password reset tokens
  await db.insert(verificationTokens).values({
    identifier: `verify:${normalizedEmail}`,
    token,
    expires,
  });

  // Send verification email
  const verifyUrl = `${BASE_URL}/verify-email?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
  const template = verificationEmail(verifyUrl);

  email.provider.send({ to: normalizedEmail, ...template }).catch((err) => {
    logger("email").error("Failed to send verification email:", err);
  });

  return successResponse;
});
