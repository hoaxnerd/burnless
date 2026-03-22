import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock rate-limit so we can isolate middleware logic
// ---------------------------------------------------------------------------
const mockCheckRateLimit = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    allowed: true,
    remaining: 99,
    resetAt: Date.now() + 60_000,
  }),
);

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  RATE_LIMITS: {
    read: { maxRequests: 100, windowMs: 60_000 },
    mutation: { maxRequests: 30, windowMs: 60_000 },
    chat: { maxRequests: 20, windowMs: 60_000 },
    ai: { maxRequests: 10, windowMs: 60_000 },
    import: { maxRequests: 5, windowMs: 60_000 },
    auth: { maxRequests: 5, windowMs: 60_000 },
    api: { maxRequests: 100, windowMs: 60_000 },
  },
}));

import { middleware } from "../middleware";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake NextRequest. We use a plain object instead of `new NextRequest`
 * because happy-dom strips the "origin" header (it's a browser-forbidden
 * header), which makes CSRF tests impossible with real Request objects.
 */
function createRequest(
  path: string,
  opts: { method?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const headerMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    headerMap[k.toLowerCase()] = v;
  }
  return {
    nextUrl: new URL(path, "http://localhost:3000"),
    method: opts.method ?? "GET",
    headers: {
      get: (name: string) => headerMap[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

/** Shorthand: is this a pass-through "next()" response? */
function isNextResponse(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("middleware", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env to known state
    process.env = { ...savedEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.ALLOWED_ORIGINS;

    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 99,
      resetAt: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  // -----------------------------------------------------------------------
  // Route bypass
  // -----------------------------------------------------------------------
  describe("route bypass", () => {
    it("passes through non-API routes without rate limiting", () => {
      const res = middleware(createRequest("/dashboard"));
      expect(isNextResponse(res)).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it("passes through /api/health", () => {
      const res = middleware(createRequest("/api/health"));
      expect(isNextResponse(res)).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it("passes through /api/auth/session (NextAuth internal)", () => {
      const res = middleware(createRequest("/api/auth/session"));
      expect(isNextResponse(res)).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it("passes through /api/auth/callback/google", () => {
      const res = middleware(createRequest("/api/auth/callback/google"));
      expect(isNextResponse(res)).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it("passes through /api/auth/providers", () => {
      const res = middleware(createRequest("/api/auth/providers"));
      expect(isNextResponse(res)).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it("passes through /api/webhooks/stripe", () => {
      const res = middleware(createRequest("/api/webhooks/stripe"));
      expect(isNextResponse(res)).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it("passes through /api/webhooks/plaid", () => {
      const res = middleware(createRequest("/api/webhooks/plaid"));
      expect(isNextResponse(res)).toBe(true);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    // These auth endpoints should NOT be skipped — they need rate limiting
    const rateLimitedAuthPaths = [
      "/api/auth/register",
      "/api/auth/check-email",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/send-verification",
      "/api/auth/verify-email",
    ];

    for (const path of rateLimitedAuthPaths) {
      it(`rate-limits ${path}`, () => {
        const res = middleware(createRequest(path));
        expect(mockCheckRateLimit).toHaveBeenCalled();
      });
    }
  });

  // -----------------------------------------------------------------------
  // CSRF / origin validation
  // -----------------------------------------------------------------------
  describe("CSRF origin validation", () => {
    it("allows mutations from localhost:3000 in dev mode", async () => {
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("allows mutations from localhost:3001 in dev mode", async () => {
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { origin: "http://localhost:3001" },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("allows mutations from 127.0.0.1:3000 in dev mode", async () => {
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3000" },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("blocks mutations from unknown origin in dev mode", async () => {
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { origin: "https://evil.com" },
      });
      const res = middleware(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden: invalid origin");
    });

    it("allows mutations when origin matches NEXT_PUBLIC_APP_URL", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.burnless.com";
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { origin: "https://app.burnless.com" },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("allows mutations when origin matches ALLOWED_ORIGINS", async () => {
      process.env.ALLOWED_ORIGINS =
        "https://app.burnless.com,https://staging.burnless.com";
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { origin: "https://staging.burnless.com" },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("trims whitespace from ALLOWED_ORIGINS entries", async () => {
      process.env.ALLOWED_ORIGINS = " https://app.burnless.com , https://staging.burnless.com ";
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { origin: "https://staging.burnless.com" },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("falls back to Referer header when Origin is absent", async () => {
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { referer: "http://localhost:3000/dashboard" },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("blocks when Referer origin is invalid", async () => {
      const req = createRequest("/api/accounts", {
        method: "POST",
        headers: { referer: "https://evil.com/phishing" },
      });
      const res = middleware(req);
      expect(res.status).toBe(403);
    });

    it("allows mutations with no Origin AND no Referer (server-to-server)", async () => {
      // When both are absent, source is null → not blocked
      const req = createRequest("/api/accounts", { method: "POST" });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("does not check CSRF on GET requests", () => {
      const req = createRequest("/api/accounts", {
        method: "GET",
        headers: { origin: "https://evil.com" },
      });
      const res = middleware(req);
      // GET is not a mutation, so CSRF check is skipped — goes straight to rate limiting
      expect(res.status).not.toBe(403);
    });

    // All mutation methods should be checked
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      it(`checks CSRF on ${method} requests`, async () => {
        const req = createRequest("/api/accounts", {
          method,
          headers: { origin: "https://evil.com" },
        });
        const res = middleware(req);
        expect(res.status).toBe(403);
      });
    }

    describe("production mode", () => {
      beforeEach(() => {
        (process.env as Record<string, string>).NODE_ENV = "production";
      });

      it("blocks all mutations when no origins are configured", async () => {
        // No NEXT_PUBLIC_APP_URL, no ALLOWED_ORIGINS → allowed.size === 0
        const req = createRequest("/api/accounts", {
          method: "POST",
          headers: { origin: "https://app.burnless.com" },
        });
        const res = middleware(req);
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toBe("Forbidden: server origin not configured");
      });

      it("does not add localhost origins in production", async () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://app.burnless.com";
        const req = createRequest("/api/accounts", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        });
        const res = middleware(req);
        expect(res.status).toBe(403);
      });

      it("allows valid origin in production", async () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://app.burnless.com";
        const req = createRequest("/api/accounts", {
          method: "POST",
          headers: { origin: "https://app.burnless.com" },
        });
        const res = middleware(req);
        expect(res.status).not.toBe(403);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Rate limit tier resolution
  // -----------------------------------------------------------------------
  describe("rate limit tier resolution", () => {
    it("uses auth tier for /api/auth/register", () => {
      middleware(
        createRequest("/api/auth/register", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      );
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 5, windowMs: 60_000 },
      );
    });

    it("uses auth tier for /api/auth/forgot-password", () => {
      middleware(
        createRequest("/api/auth/forgot-password", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      );
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 5, windowMs: 60_000 },
      );
    });

    it("uses chat tier for /api/chat", () => {
      middleware(
        createRequest("/api/chat", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      );
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 20, windowMs: 60_000 },
      );
    });

    it("uses ai tier for /api/insights", () => {
      middleware(createRequest("/api/insights"));
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 10, windowMs: 60_000 },
      );
    });

    it("uses ai tier for /api/scenarios/ai-generate", () => {
      middleware(createRequest("/api/scenarios/ai-generate"));
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 10, windowMs: 60_000 },
      );
    });

    it("uses ai tier for /api/onboarding/enrich", () => {
      middleware(createRequest("/api/onboarding/enrich"));
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 10, windowMs: 60_000 },
      );
    });

    it("uses import tier for /api/import", () => {
      middleware(
        createRequest("/api/import", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      );
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 5, windowMs: 60_000 },
      );
    });

    it("uses mutation tier for generic POST", () => {
      middleware(
        createRequest("/api/accounts", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      );
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 30, windowMs: 60_000 },
      );
    });

    it("uses read tier for GET requests", () => {
      middleware(createRequest("/api/accounts"));
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.any(String),
        { maxRequests: 100, windowMs: 60_000 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Rate limit key construction
  // -----------------------------------------------------------------------
  describe("rate limit key construction", () => {
    it("uses x-forwarded-for IP when present", () => {
      middleware(
        createRequest("/api/accounts", {
          headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.1" },
        }),
      );
      const key: string = mockCheckRateLimit.mock.calls[0]![0];
      expect(key).toContain("203.0.113.50");
    });

    it("uses x-real-ip as fallback", () => {
      middleware(
        createRequest("/api/accounts", {
          headers: { "x-real-ip": "198.51.100.42" },
        }),
      );
      const key: string = mockCheckRateLimit.mock.calls[0]![0];
      expect(key).toContain("198.51.100.42");
    });

    it("uses 'unknown' when no IP headers present", () => {
      middleware(createRequest("/api/accounts"));
      const key: string = mockCheckRateLimit.mock.calls[0]![0];
      expect(key).toContain("unknown");
    });

    it("includes tier key in rate limit key", () => {
      middleware(createRequest("/api/chat", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      }));
      const key: string = mockCheckRateLimit.mock.calls[0]![0];
      expect(key).toContain("chat");
    });

    it("includes path group in rate limit key", () => {
      middleware(createRequest("/api/accounts/123"));
      const key: string = mockCheckRateLimit.mock.calls[0]![0];
      // Path group = first 4 segments: /api/accounts/123
      expect(key).toContain("/api/accounts/123");
    });
  });

  // -----------------------------------------------------------------------
  // Rate limit responses
  // -----------------------------------------------------------------------
  describe("rate limit enforcement", () => {
    it("returns 429 when rate limited", async () => {
      mockCheckRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 30_000,
      });

      const res = middleware(createRequest("/api/accounts"));
      expect(res.status).toBe(429);

      const body = await res.json();
      expect(body.error).toContain("Too many requests");
    });

    it("sets Retry-After header on 429", () => {
      const resetAt = Date.now() + 30_000;
      mockCheckRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        resetAt,
      });

      const res = middleware(createRequest("/api/accounts"));
      const retryAfter = Number(res.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(30);
    });

    it("sets rate limit headers on 429", () => {
      mockCheckRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 30_000,
      });

      const res = middleware(createRequest("/api/accounts"));
      expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
    });

    it("sets rate limit headers on allowed requests", () => {
      mockCheckRateLimit.mockReturnValue({
        allowed: true,
        remaining: 42,
        resetAt: Date.now() + 60_000,
      });

      const res = middleware(createRequest("/api/accounts"));
      expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("42");
      expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
    });
  });
});
