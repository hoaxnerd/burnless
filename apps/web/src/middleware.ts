import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "./lib/rate-limit";

/**
 * Next.js middleware for rate limiting API routes.
 * Runs on the edge before route handlers.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit API routes
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Skip auth callback routes (NextAuth internal)
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  // Skip webhooks (they have their own signature verification)
  if (pathname.startsWith("/api/webhooks/")) return NextResponse.next();

  // Determine rate limit tier
  let config = RATE_LIMITS.api!;
  if (pathname.startsWith("/api/chat")) config = RATE_LIMITS.chat!;
  else if (pathname.startsWith("/api/import")) config = RATE_LIMITS.import!;

  // Use forwarded IP or fallback
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const key = `${ip}:${pathname.split("/").slice(0, 4).join("/")}`;
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((result.resetAt - Date.now()) / 1000)
          ),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set(
    "X-RateLimit-Remaining",
    String(result.remaining)
  );
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
