import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { signIn } from "@/lib/auth";
import { getCapabilities } from "@/lib/capabilities";
import { ensureLocalUser } from "@/lib/local-auth";
import { sanitizeCallback } from "@/lib/auto-login";

/**
 * S4a — programmatic auto-login session establishment.
 *
 * Hit by the middleware redirect (a later task) when `autoLogin` is on, there's
 * no session, and the request is a top-level navigation. Establishes a NextAuth
 * session for the single local owner and redirects to the (sanitized) callback.
 *
 * Empirical contract for next-auth@5.0.0-beta.30 (verified against
 * node_modules .../next-auth/lib/actions.js):
 *
 *  - Provider routing: server-side `signIn(id, ...)` loops `config.providers`
 *    and matches on `options?.id ?? defaults.id`. Our second Credentials
 *    provider is registered with `id: "local-auto"` (surfaced at
 *    `provider.options.id`), so `signIn("local-auto", ...)` resolves to it and
 *    is NOT shadowed by the default `"credentials"` provider.
 *
 *  - Return/throw shape (Form B): for a credentials provider, `signIn` POSTs to
 *    `@auth/core` with `raw`, writes the returned session cookies onto the Next
 *    `cookies()` jar (so the Set-Cookie is applied to THIS response), then — since
 *    `redirect` defaults to `true` and we do not pass `{ redirect: false }` —
 *    calls Next's `redirect()`, which THROWS a `NEXT_REDIRECT`. We therefore must
 *    NOT wrap `signIn` in try/catch: the framework catches the thrown redirect and
 *    emits a 3xx carrying the session cookie. `redirectTo` becomes the Location.
 *
 * Net effect: GET /api/auth/auto-login?callbackUrl=/dashboard (autoLogin on +
 * owner present) sets the NextAuth session cookie and 3xx-redirects to /dashboard.
 */
export async function GET(req: NextRequest) {
  if (!getCapabilities().autoLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Self-heal: boot (instrumentation) normally creates the owner, but create it
  // defensively here too. No-op when a user already exists.
  await ensureLocalUser();

  const callbackUrl = sanitizeCallback(req.nextUrl.searchParams.get("callbackUrl"));

  // `signIn` sets the session cookie then THROWS the redirect (NEXT_REDIRECT).
  // Returning its result lets that thrown redirect propagate to Next — do NOT
  // catch it.
  return signIn("local-auto", { redirectTo: callbackUrl });
}
