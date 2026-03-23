import { NextResponse } from "next/server";
import { z } from "zod";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { withErrorHandler, getAuthUser, errorResponse } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { verifyTotpCode } from "@/lib/two-factor";

const schema = z.object({ code: z.string().min(6).max(8) });

/** POST /api/auth/two-factor/disable — Disable 2FA (requires valid TOTP code) */
export const POST = withErrorHandler(async (request: Request) => {
  const blocked = await applyRateLimit(request, "auth");
  if (blocked) return blocked;

  const user = await getAuthUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = schema.parse(await request.json());

  const [dbUser] = await db
    .select({
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorSecret: users.twoFactorSecret,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!dbUser?.twoFactorEnabled || !dbUser.twoFactorSecret) {
    return errorResponse("2FA is not enabled", 400);
  }

  const valid = verifyTotpCode(body.code, dbUser.twoFactorSecret);
  if (!valid) {
    return errorResponse("Invalid code. Please try again.", 400);
  }

  await db
    .update(users)
    .set({ twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null })
    .where(eq(users.id, user.id));

  return NextResponse.json({ disabled: true });
});
