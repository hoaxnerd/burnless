import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users, verificationTokens } from "@burnless/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { hashPassword } from "@/lib/password";
import { email } from "@/lib/email";
import { verificationEmail } from "@/lib/email/templates";

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
});

export async function POST(request: Request) {
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
        console.error("[email] Failed to send verification email:", err);
      });
    } catch (err) {
      console.error("[register] Failed to insert verification token:", err);
      return NextResponse.json(
        { error: "Account created but verification failed. Please request a new verification email." },
        { status: 201 }
      );
    }
  }

  return NextResponse.json(user, { status: 201 });
}
