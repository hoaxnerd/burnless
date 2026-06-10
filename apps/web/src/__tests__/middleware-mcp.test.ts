/**
 * Middleware additions for the MCP expose surface (spec §4.1 / §9.2):
 * /mcp gets the `mcp` tier keyed per credential and is CSRF-exempt;
 * /api/oauth/token + /api/oauth/register are CSRF-exempt and ride the
 * auth tier; /api/oauth/* tier resolution.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mockCheckRateLimit = vi.hoisted(() =>
  vi.fn().mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 })
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
    mcp: { maxRequests: 60, windowMs: 60_000 },
    api: { maxRequests: 100, windowMs: 60_000 },
  },
}));

import { middleware, config } from "../middleware";

function createRequest(
  path: string,
  opts: { method?: string; headers?: Record<string, string> } = {}
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
      // Headers(init) iterates entries() in the next() helper
      [Symbol.iterator]: function* () {
        yield* Object.entries(headerMap);
      },
      entries: function* () {
        yield* Object.entries(headerMap);
      },
      forEach: (cb: (v: string, k: string) => void) => {
        for (const [k, v] of Object.entries(headerMap)) cb(v, k);
      },
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockCheckRateLimit.mockClear();
});

describe("/mcp middleware branch", () => {
  it("matcher includes /mcp", () => {
    expect(config.matcher).toContain("/mcp");
  });

  it("POST /mcp with a cross-site origin is NOT CSRF-blocked (bearer-authed API)", () => {
    const res = middleware(
      createRequest("/mcp", {
        method: "POST",
        headers: { origin: "https://claude.ai", authorization: "Bearer bl_pat_abc" },
      })
    );
    expect(res.status).not.toBe(403);
  });

  it("rate-limits /mcp on the mcp tier keyed by a credential hash, not the IP path-group", () => {
    middleware(
      createRequest("/mcp", {
        method: "POST",
        headers: { authorization: "Bearer bl_pat_abc", "x-forwarded-for": "1.2.3.4" },
      })
    );
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    const [key, cfg] = mockCheckRateLimit.mock.calls[0]!;
    expect(key).toMatch(/^mcp:[0-9a-f]+$/);
    expect(cfg).toEqual({ maxRequests: 60, windowMs: 60_000 });
    // two different tokens → two different keys
    middleware(
      createRequest("/mcp", {
        method: "POST",
        headers: { authorization: "Bearer bl_pat_OTHER", "x-forwarded-for": "1.2.3.4" },
      })
    );
    const [key2] = mockCheckRateLimit.mock.calls[1]!;
    expect(key2).not.toBe(key);
  });

  it("unauthenticated /mcp requests fall back to an IP-derived key", () => {
    middleware(
      createRequest("/mcp", {
        method: "POST",
        headers: { "x-forwarded-for": "9.9.9.9" },
      })
    );
    const [key] = mockCheckRateLimit.mock.calls[0]!;
    expect(key).toBe("mcp:ip:9.9.9.9");
  });

  it("returns 429 with Retry-After when over the limit", async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const res = middleware(
      createRequest("/mcp", { method: "POST", headers: { authorization: "Bearer x" } })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});

describe("OAuth endpoint exemptions (spec §4.1)", () => {
  it("POST /api/oauth/token from a cross-site origin is NOT CSRF-blocked", () => {
    const res = middleware(
      createRequest("/api/oauth/token", {
        method: "POST",
        headers: { origin: "https://claude.ai" },
      })
    );
    expect(res.status).not.toBe(403);
  });

  it("POST /api/oauth/register is CSRF-exempt and rides the auth tier", () => {
    const res = middleware(
      createRequest("/api/oauth/register", {
        method: "POST",
        headers: { origin: "https://claude.ai", "x-forwarded-for": "1.2.3.4" },
      })
    );
    expect(res.status).not.toBe(403);
    const [key, cfg] = mockCheckRateLimit.mock.calls[0]!;
    expect(key).toContain(":auth:");
    expect(cfg).toEqual({ maxRequests: 5, windowMs: 60_000 });
  });

  it("other /api mutations from a foreign origin are still CSRF-blocked", () => {
    const res = middleware(
      createRequest("/api/scenarios", {
        method: "POST",
        headers: { origin: "https://evil.com" },
      })
    );
    expect(res.status).toBe(403);
  });
});
