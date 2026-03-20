import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "./lib/rate-limit";

/** HTTP methods that represent mutations */
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Allowed origins for CSRF protection.
 * In production, this should be set via NEXT_PUBLIC_APP_URL or ALLOWED_ORIGINS env var.
 */
function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  if (process.env.NEXT_PUBLIC_APP_URL) origins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",").forEach((o) => origins.add(o.trim()));
  }
  // Always allow localhost in development
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:3001");
    origins.add("http://127.0.0.1:3000");
  }
  return origins;
}

/**
 * Next.js middleware for tiered rate limiting.
 *
 * Tiers:
 *   auth       — 5 req/min  (brute force protection)
 *   chat       — 20 req/min (AI cost control)
 *   import     — 5 req/min  (heavy processing)
 *   mutation   — 30 req/min (POST/PUT/PATCH/DELETE)
 *   read       — 100 req/min (GET)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit API routes
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Skip NextAuth session/callback internals (they have CSRF + session validation)
  if (
    pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/auth/register") &&
    !pathname.startsWith("/api/auth/check-email") &&
    !pathname.startsWith("/api/auth/forgot-password") &&
    !pathname.startsWith("/api/auth/reset-password")
  ) {
    return NextResponse.next();
  }

  // Skip webhooks (they have their own signature verification)
  if (pathname.startsWith("/api/webhooks/")) return NextResponse.next();

  // CSRF protection: verify Origin header on mutation requests
  if (MUTATION_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const source = origin ?? (referer ? new URL(referer).origin : null);
    const allowed = getAllowedOrigins();

    // If we have allowed origins configured and the request has an origin, verify it
    if (allowed.size > 0 && source && !allowed.has(source)) {
      return NextResponse.json(
        { error: "Forbidden: invalid origin" },
        { status: 403 }
      );
    }
  }

  // Use forwarded IP or fallback
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // Determine rate limit tier
  const config = resolveRateLimitTier(pathname, request.method);
  const tierKey = resolveTierKey(pathname, request.method);

  // Key groups by IP + tier + path group (prevents one endpoint from consuming another's budget)
  const pathGroup = pathname.split("/").slice(0, 4).join("/");
  const key = `${ip}:${tierKey}:${pathGroup}`;

  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(config.maxRequests));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  return response;
}

function resolveRateLimitTier(pathname: string, method: string) {
  // Auth endpoints — strictest tier (brute force protection)
  if (
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/api/auth/check-email") ||
    pathname.startsWith("/api/auth/forgot-password") ||
    pathname.startsWith("/api/auth/reset-password")
  ) {
    return RATE_LIMITS.auth!;
  }

  // AI endpoints — cost-controlled tier (LLM calls are expensive)
  if (pathname.startsWith("/api/chat")) return RATE_LIMITS.chat!;
  if (pathname.startsWith("/api/insights")) return RATE_LIMITS.ai!;
  if (pathname.startsWith("/api/scenarios/ai-generate")) return RATE_LIMITS.ai!;
  if (pathname.startsWith("/api/onboarding/enrich")) return RATE_LIMITS.ai!;

  // Import — heavy processing tier
  if (pathname.startsWith("/api/import")) return RATE_LIMITS.import!;

  // Mutations vs reads
  if (MUTATION_METHODS.has(method)) return RATE_LIMITS.mutation!;
  return RATE_LIMITS.read!;
}

function resolveTierKey(pathname: string, method: string): string {
  if (pathname.startsWith("/api/auth/")) return "auth";
  if (pathname.startsWith("/api/chat")) return "chat";
  if (pathname.startsWith("/api/insights")) return "ai";
  if (pathname.startsWith("/api/scenarios/ai-generate")) return "ai";
  if (pathname.startsWith("/api/onboarding/enrich")) return "ai";
  if (pathname.startsWith("/api/import")) return "import";
  if (MUTATION_METHODS.has(method)) return "mutation";
  return "read";
}

export const config = {
  matcher: "/api/:path*",
};
