import { NextResponse } from "next/server";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { withErrorHandler, getAuthUser, errorResponse } from "@/lib/api-helpers";

/** GET /api/auth/two-factor/status — Check if 2FA is enabled for the current user */
export const GET = withErrorHandler(async () => {
  const user = await getAuthUser();
  if (!user) return errorResponse("Unauthorized", 401);

  const [dbUser] = await db
    .select({ twoFactorEnabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return NextResponse.json({ enabled: dbUser?.twoFactorEnabled ?? false });
});
