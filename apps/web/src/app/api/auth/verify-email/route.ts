import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users, verificationTokens } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { email as emailService } from "@/lib/email";
import { welcomeEmail } from "@/lib/email/templates";

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
});

export async function POST(request: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const normalizedEmail = body.email.toLowerCase().trim();
  const identifier = `verify:${normalizedEmail}`;

  // Look up the token
  const [storedToken] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, body.token)
      )
    )
    .limit(1);

  if (!storedToken) {
    return NextResponse.json(
      { error: "Invalid or expired verification link. Please request a new one." },
      { status: 400 }
    );
  }

  // Check expiry
  if (storedToken.expires < new Date()) {
    // Clean up expired token
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, identifier));

    return NextResponse.json(
      { error: "This verification link has expired. Please request a new one." },
      { status: 400 }
    );
  }

  // Set emailVerified on the user
  const [user] = await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(eq(users.email, normalizedEmail))
    .returning({ id: users.id, name: users.name, email: users.email });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Clean up all verification tokens for this email
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, identifier));

  // Send welcome email now that email is verified (fire-and-forget)
  if (emailService.provider && user.email) {
    const template = welcomeEmail(user.name ?? "there");
    emailService.provider.send({ to: user.email, ...template }).catch((err: unknown) => {
      console.error("[email] Failed to send welcome email:", err);
    });
  }

  return NextResponse.json({ message: "Email verified successfully" });
}
