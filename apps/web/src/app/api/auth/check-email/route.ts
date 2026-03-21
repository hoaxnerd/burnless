import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { withErrorHandler } from "@/lib/api-helpers";

const schema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/check-email
 *
 * Always returns 200 with { exists: boolean }.
 * Rate-limited to 5 req/min in middleware (auth tier).
 *
 * Security: adds timing-safe delay to prevent enumeration via response timing.
 * The delay is random (50-150ms) regardless of whether the email exists.
 */
export const POST = withErrorHandler(async (request: Request) => {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    // Return same shape even on bad input to prevent info leak
    return NextResponse.json({ exists: false });
  }

  const start = Date.now();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase().trim()))
    .limit(1);

  // Add random delay to make timing attacks impractical
  const elapsed = Date.now() - start;
  const targetMs = 50 + Math.random() * 100; // 50-150ms total
  const remaining = Math.max(0, targetMs - elapsed);
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining));
  }

  return NextResponse.json({ exists: !!existing });
});
