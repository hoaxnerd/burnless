import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users, verificationTokens } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { hashPassword } from "@/lib/password";

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export async function POST(request: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      const message = e.errors.map((err) => err.message).join(". ");
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const normalizedEmail = body.email.toLowerCase().trim();

  // Find and validate the token
  const [tokenRecord] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, normalizedEmail),
        eq(verificationTokens.token, body.token)
      )
    )
    .limit(1);

  if (!tokenRecord) {
    return NextResponse.json(
      { error: "Invalid or expired reset link. Please request a new one." },
      { status: 400 }
    );
  }

  if (tokenRecord.expires < new Date()) {
    // Clean up expired token
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, normalizedEmail),
          eq(verificationTokens.token, body.token)
        )
      );
    return NextResponse.json(
      { error: "Reset link has expired. Please request a new one." },
      { status: 400 }
    );
  }

  // Update password
  const passwordHash = await hashPassword(body.password);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.email, normalizedEmail));

  // Delete the used token (and any other tokens for this email)
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, normalizedEmail));

  return NextResponse.json({ message: "Password reset successfully." });
}
