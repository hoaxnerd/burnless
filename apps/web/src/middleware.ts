import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "./lib/rate-limit";

/** HTTP methods that represent mutations */
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Spec-defined cross-origin OAuth endpoints (expose spec §4.1) — bearer/
 *  PKCE-authed, exempt from the browser-origin CSRF allowlist. */
const CSRF_EXEMPT_PATHS = new Set(["/api/oauth/token", "/api/oauth/register"]);

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
  return origins;
}

/**
 * In dev mode any localhost / 127.0.0.1 origin is allowed regardless of port —
 * devs run on whatever port turbo/next/PORT picks, and CSRF on a same-machine
 * loopback request adds no real protection. Production must rely on the
 * configured allowlist.
 */
function isDevLoopbackOrigin(source: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const u = new URL(source);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/**
 * Tiny synchronous 32-bit FNV-1a hash → hex. Used ONLY for rate-limit key
 * derivation from bearer headers (per-credential keying without putting raw
 * token material in keys). NOT cryptographic — never use for verification.
 */
function fnv1a32hex(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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

  // Rate-limit API routes + the MCP endpoint (expose spec §4.1)
  if (!pathname.startsWith("/api/") && pathname !== "/mcp") return NextResponse.next();

  // Inject correlation ID for all API requests (readable by route handlers via headers)
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  /** Forward the request-id on both the request (for route handlers) and response (for callers). */
  function next() {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // Dev/test escape hatch — never honored in production (see api-rate-limit.ts).
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DISABLE_RATE_LIMIT === "true"
  ) {
    return next();
  }

  // Skip health check (monitoring services poll frequently)
  if (pathname === "/api/health") return next();

  // Skip NextAuth session/callback internals (they have CSRF + session validation)
  if (
    pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/auth/register") &&
    !pathname.startsWith("/api/auth/check-email") &&
    !pathname.startsWith("/api/auth/forgot-password") &&
    !pathname.startsWith("/api/auth/reset-password") &&
    !pathname.startsWith("/api/auth/send-verification") &&
    !pathname.startsWith("/api/auth/verify-email") &&
    !pathname.startsWith("/api/auth/redeem-invite")
  ) {
    return next();
  }

  // Skip webhooks (they have their own signature verification)
  if (pathname.startsWith("/api/webhooks/")) return next();

  // ── /mcp (expose spec §4.1) ────────────────────────────────────────────
  // Bearer-authed, spec-defined cross-origin API: CSRF origin checks do not
  // apply. Two-layer rate limit:
  //   1. PER CREDENTIAL on the `mcp` tier (a stable non-cryptographic hash of
  //      the Authorization header — middleware is sync, and keying needs
  //      stability, not secrecy). Fairness between tokens.
  //   2. PER IP backstop on the `mcpIp` tier (higher cap). The credential key
  //      is attacker-controlled — rotating a random bearer per request mints a
  //      fresh bucket — so without this cap an unauthenticated attacker gets
  //      unbounded route-level sha256+DB token lookups. The IP key cannot be
  //      forged behind a trusted proxy, so it bounds total throughput.
  // Unauthenticated requests (no Authorization header) take only the IP key
  // at the stricter `mcp` cap (they die with 401 in the route anyway).
  if (pathname === "/mcp") {
    const authHeader = request.headers.get("authorization");
    const ipForMcp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const mcpConfig = RATE_LIMITS.mcp!;

    const tooManyMcp = (resetAt: number, limit: number) => {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
          },
        }
      );
    };

    let mcpResult;
    if (authHeader) {
      mcpResult = checkRateLimit(`mcp:${fnv1a32hex(authHeader)}`, mcpConfig);
      if (!mcpResult.allowed) {
        return tooManyMcp(mcpResult.resetAt, mcpConfig.maxRequests);
      }
      // IP backstop — bounds aggregate throughput across rotated credentials.
      const ipConfig = RATE_LIMITS.mcpIp!;
      const ipResult = checkRateLimit(`mcp:ip:${ipForMcp}`, ipConfig);
      if (!ipResult.allowed) {
        return tooManyMcp(ipResult.resetAt, ipConfig.maxRequests);
      }
    } else {
      mcpResult = checkRateLimit(`mcp:ip:${ipForMcp}`, mcpConfig);
      if (!mcpResult.allowed) {
        return tooManyMcp(mcpResult.resetAt, mcpConfig.maxRequests);
      }
    }
    const res = next();
    res.headers.set("X-RateLimit-Limit", String(mcpConfig.maxRequests));
    res.headers.set("X-RateLimit-Remaining", String(mcpResult.remaining));
    return res;
  }

  // CSRF protection: verify Origin header on mutation requests
  if (MUTATION_METHODS.has(request.method) && !CSRF_EXEMPT_PATHS.has(pathname)) {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const source = origin ?? (referer ? new URL(referer).origin : null);
    const allowed = getAllowedOrigins();

    // In production, block if no origins are configured (misconfiguration) or origin doesn't match
    if (process.env.NODE_ENV === "production" && allowed.size === 0) {
      return NextResponse.json(
        { error: "Forbidden: server origin not configured" },
        { status: 403 }
      );
    }
    // Block mutations without any origin header in production (prevents CSRF from non-browser clients)
    if (process.env.NODE_ENV === "production" && !source) {
      return NextResponse.json(
        { error: "Forbidden: missing origin" },
        { status: 403 }
      );
    }
    // A source is acceptable if it's in the configured allowlist OR (in dev) is
    // a loopback origin. In dev with no configured allowlist, only loopback is
    // accepted; that keeps "blocks https://evil.com in dev" intact.
    if (source && !allowed.has(source) && !isDevLoopbackOrigin(source)) {
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

  const response = next();
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
    pathname.startsWith("/api/auth/reset-password") ||
    pathname.startsWith("/api/auth/send-verification") ||
    pathname.startsWith("/api/auth/verify-email") ||
    pathname.startsWith("/api/auth/redeem-invite")
  ) {
    return RATE_LIMITS.auth!;
  }

  // OAuth AS endpoints ride the auth tier (expose spec §4.1)
  if (pathname.startsWith("/api/oauth/")) return RATE_LIMITS.auth!;

  // AI endpoints — cost-controlled tier (LLM calls are expensive)
  if (pathname.startsWith("/api/chat")) return RATE_LIMITS.chat!;
  if (pathname.startsWith("/api/insights")) return RATE_LIMITS.ai!;
  if (pathname.startsWith("/api/onboarding/enrich")) return RATE_LIMITS.ai!;

  // Import — heavy processing tier
  if (pathname.startsWith("/api/import")) return RATE_LIMITS.import!;

  // Mutations vs reads
  if (MUTATION_METHODS.has(method)) return RATE_LIMITS.mutation!;
  return RATE_LIMITS.read!;
}

function resolveTierKey(pathname: string, method: string): string {
  if (pathname.startsWith("/api/auth/")) return "auth";
  if (pathname.startsWith("/api/oauth/")) return "auth";
  if (pathname.startsWith("/api/chat")) return "chat";
  if (pathname.startsWith("/api/insights")) return "ai";
  if (pathname.startsWith("/api/onboarding/enrich")) return "ai";
  if (pathname.startsWith("/api/import")) return "import";
  if (MUTATION_METHODS.has(method)) return "mutation";
  return "read";
}

export const config = {
  matcher: ["/api/:path*", "/mcp"],
};
