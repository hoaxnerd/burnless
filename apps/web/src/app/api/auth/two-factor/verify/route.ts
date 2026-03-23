import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";

const schema = z.object({ email: z.string().email() });

/** POST /api/auth/two-factor/verify — Check if 2FA is required for a user */
export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  const body = schema.parse(await request.json());

  const [user] = await db
    .select({ twoFactorEnabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase().trim()))
    .limit(1);

  return NextResponse.json({ required: user?.twoFactorEnabled ?? false });
});
