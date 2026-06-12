import { NextResponse } from "next/server";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { getAuthUser, withErrorHandler, errorResponse } from "@/lib/api-helpers";

/** S4a — live claim state for the Security tab + sign-out gating. claimed ≡ passwordHash != null. */
export const GET = withErrorHandler(async () => {
  const sessionUser = await getAuthUser();
  if (!sessionUser?.id) return errorResponse("Unauthorized", 401);
  const [u] = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!u) return errorResponse("Unauthorized", 401);
  return NextResponse.json({ email: u.email, isClaimed: u.passwordHash != null });
});
