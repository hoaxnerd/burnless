import { NextResponse } from "next/server";
import { NO_AUTOLOGIN_COOKIE } from "@/lib/auto-login";

/**
 * S4a — sets the auto-login suppression cookie. Called by a CLAIMED local user's
 * "Sign Out" just before NextAuth signOut, so the next unauthenticated visit
 * shows the login screen instead of auto-logging back in (spec §6). Cleared by
 * the middleware on the next authenticated request.
 */
export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(NO_AUTOLOGIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
