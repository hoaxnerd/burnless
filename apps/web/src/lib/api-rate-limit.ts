/**
 * Redis-backed rate limiting for API route handlers.
 *
 * Usage in route handlers:
 *   const blocked = await applyRateLimit(request, "auth");
 *   if (blocked) return blocked;
 *
 * This is the second layer of defense (Layer 2):
 *   Layer 1: Edge middleware — in-memory, per-instance (catches basic abuse)
 *   Layer 2: Route handler — Redis, cross-instance (catches distributed abuse)
 */
import { NextResponse } from "next/server";
import { checkRateLimitAsync, RATE_LIMITS } from "./rate-limit";

/**
 * Extract client IP from request headers.
 */
function getClientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Apply Redis-backed rate limiting to a route handler.
 *
 * @param request - The incoming request
 * @param tier - Rate limit tier key (e.g., "auth", "chat", "ai", "import")
 * @param keyOverride - Optional custom key (defaults to IP-based)
 * @returns NextResponse with 429 status if rate limited, null if allowed
 */
export async function applyRateLimit(
  request: Request,
  tier: string,
  keyOverride?: string
): Promise<NextResponse | null> {
  const config = RATE_LIMITS[tier];
  if (!config) return null;

  const ip = getClientIp(request);
  const pathname = new URL(request.url).pathname;
  const pathGroup = pathname.split("/").slice(0, 4).join("/");
  const key = keyOverride ?? `${ip}:${tier}:${pathGroup}`;

  const result = await checkRateLimitAsync(key, config);

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
      }
    );
  }

  return null;
}
