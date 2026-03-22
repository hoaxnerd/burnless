import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock checkRateLimitAsync to control behavior
const mockCheckRateLimitAsync = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 60_000,
  })
);

vi.mock("../rate-limit", () => ({
  checkRateLimitAsync: mockCheckRateLimitAsync,
  RATE_LIMITS: {
    auth: { maxRequests: 5, windowMs: 60_000 },
    chat: { maxRequests: 20, windowMs: 60_000 },
    ai: { maxRequests: 10, windowMs: 60_000 },
    import: { maxRequests: 5, windowMs: 60_000 },
  },
}));

import { applyRateLimit } from "../api-rate-limit";

function createRequest(
  path: string,
  opts: { headers?: Record<string, string> } = {}
): Request {
  const headers = new Headers(opts.headers);
  return new Request(`http://localhost:3000${path}`, { headers });
}

describe("applyRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimitAsync.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    });
  });

  it("returns null when request is allowed", async () => {
    const req = createRequest("/api/auth/register");
    const result = await applyRateLimit(req, "auth");
    expect(result).toBeNull();
  });

  it("returns 429 response when rate limited", async () => {
    mockCheckRateLimitAsync.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const req = createRequest("/api/auth/register");
    const result = await applyRateLimit(req, "auth");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);

    const body = await result!.json();
    expect(body.error).toContain("Too many requests");
  });

  it("sets rate limit headers on 429", async () => {
    mockCheckRateLimitAsync.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const req = createRequest("/api/auth/register");
    const result = await applyRateLimit(req, "auth");

    expect(result!.headers.get("Retry-After")).toBeTruthy();
    expect(result!.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(result!.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(result!.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("uses x-forwarded-for for client IP", async () => {
    const req = createRequest("/api/auth/register", {
      headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.1" },
    });
    await applyRateLimit(req, "auth");

    const key = mockCheckRateLimitAsync.mock.calls[0]![0] as string;
    expect(key).toContain("203.0.113.50");
  });

  it("uses x-real-ip as fallback", async () => {
    const req = createRequest("/api/auth/register", {
      headers: { "x-real-ip": "198.51.100.42" },
    });
    await applyRateLimit(req, "auth");

    const key = mockCheckRateLimitAsync.mock.calls[0]![0] as string;
    expect(key).toContain("198.51.100.42");
  });

  it("uses 'unknown' when no IP headers present", async () => {
    const req = createRequest("/api/auth/register");
    await applyRateLimit(req, "auth");

    const key = mockCheckRateLimitAsync.mock.calls[0]![0] as string;
    expect(key).toContain("unknown");
  });

  it("includes tier in key", async () => {
    const req = createRequest("/api/chat");
    await applyRateLimit(req, "chat");

    const key = mockCheckRateLimitAsync.mock.calls[0]![0] as string;
    expect(key).toContain("chat");
  });

  it("returns null for unknown tier", async () => {
    const req = createRequest("/api/something");
    const result = await applyRateLimit(req, "nonexistent");
    expect(result).toBeNull();
    expect(mockCheckRateLimitAsync).not.toHaveBeenCalled();
  });

  it("supports custom key override", async () => {
    const req = createRequest("/api/chat");
    await applyRateLimit(req, "chat", "custom:user123:chat");

    const key = mockCheckRateLimitAsync.mock.calls[0]![0] as string;
    expect(key).toBe("custom:user123:chat");
  });
});
