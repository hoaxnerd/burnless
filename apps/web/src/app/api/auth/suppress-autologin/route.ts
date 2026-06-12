import { NextResponse } from "next/server";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/api-helpers";
import { NO_AUTOLOGIN_COOKIE } from "@/lib/auto-login";

/**
 * S4a — sets the auto-login suppression cookie for a CLAIMED local user's
 * "Sign Out" (so the next visit shows /login instead of auto-logging back in).
 * Auth + claimed required: an unclaimed user has no password and must never be
 * able to lock themselves (or be locked) out (spec §6). Cleared by middleware
 * on the next authenticated request.
 */
export async function POST() {
  const sessionUser = await getAuthUser();
  if (!sessionUser?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [u] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!u?.passwordHash) return NextResponse.json({ error: "Account not claimed" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(NO_AUTOLOGIN_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
