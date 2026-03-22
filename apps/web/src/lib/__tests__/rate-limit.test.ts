import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkRateLimit,
  checkRateLimitAsync,
  RATE_LIMITS,
  type RateLimitConfig,
} from "../rate-limit";

// Mock the redis module — tests run without a Redis connection
vi.mock("../redis", () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

describe("rate-limit", () => {
  let testKey = 0;
  function uniqueKey() {
    return `test-${++testKey}-${Date.now()}`;
  }

  // -----------------------------------------------------------------------
  // Synchronous in-memory rate limiter (used by Edge middleware)
  // -----------------------------------------------------------------------
  describe("checkRateLimit (sync/in-memory)", () => {
    it("allows first request", () => {
      const result = checkRateLimit(uniqueKey(), { maxRequests: 5, windowMs: 60000 });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("decrements remaining count", () => {
      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 3, windowMs: 60000 };

      const r1 = checkRateLimit(key, config);
      expect(r1.remaining).toBe(2);

      const r2 = checkRateLimit(key, config);
      expect(r2.remaining).toBe(1);

      const r3 = checkRateLimit(key, config);
      expect(r3.remaining).toBe(0);
    });

    it("blocks when limit is reached", () => {
      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 2, windowMs: 60000 };

      checkRateLimit(key, config); // 1
      checkRateLimit(key, config); // 2

      const blocked = checkRateLimit(key, config);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it("returns resetAt timestamp", () => {
      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 1, windowMs: 60000 };

      checkRateLimit(key, config); // use up the limit
      const blocked = checkRateLimit(key, config);

      expect(blocked.allowed).toBe(false);
      expect(blocked.resetAt).toBeGreaterThan(Date.now() - 1000);
      expect(blocked.resetAt).toBeLessThanOrEqual(Date.now() + 60001);
    });

    it("different keys are independent", () => {
      const config: RateLimitConfig = { maxRequests: 1, windowMs: 60000 };

      const key1 = uniqueKey();
      const key2 = uniqueKey();

      checkRateLimit(key1, config); // key1 used up
      const result = checkRateLimit(key2, config); // key2 fresh
      expect(result.allowed).toBe(true);
    });

    it("allows single request with maxRequests=1", () => {
      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 1, windowMs: 60000 };

      const first = checkRateLimit(key, config);
      expect(first.allowed).toBe(true);
      expect(first.remaining).toBe(0);

      const second = checkRateLimit(key, config);
      expect(second.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Async rate limiter (falls back to in-memory when Redis unavailable)
  // -----------------------------------------------------------------------
  describe("checkRateLimitAsync (async, Redis fallback)", () => {
    it("falls back to in-memory when Redis unavailable", async () => {
      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 3, windowMs: 60000 };

      const result = await checkRateLimitAsync(key, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it("blocks when limit reached (in-memory fallback)", async () => {
      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 2, windowMs: 60000 };

      await checkRateLimitAsync(key, config);
      await checkRateLimitAsync(key, config);

      const blocked = await checkRateLimitAsync(key, config);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it("returns same interface as sync version", async () => {
      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 5, windowMs: 60000 };

      const result = await checkRateLimitAsync(key, config);
      expect(result).toHaveProperty("allowed");
      expect(result).toHaveProperty("remaining");
      expect(result).toHaveProperty("resetAt");
      expect(typeof result.allowed).toBe("boolean");
      expect(typeof result.remaining).toBe("number");
      expect(typeof result.resetAt).toBe("number");
    });
  });

  // -----------------------------------------------------------------------
  // Async with mock Redis pipeline
  // -----------------------------------------------------------------------
  describe("checkRateLimitAsync (with Redis)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("uses Redis when available", async () => {
      const { getRedis } = await import("../redis");
      const mockPipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 0], // zremrangebyscore
          [null, 2], // zcard — 2 existing entries
          [null, 1], // zadd
          [null, 1], // pexpire
        ]),
      };
      const mockRedis = { pipeline: vi.fn().mockReturnValue(mockPipeline) };
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);

      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 5, windowMs: 60000 };

      const result = await checkRateLimitAsync(key, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // 5 - 2 - 1
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it("blocks via Redis when over limit", async () => {
      const { getRedis } = await import("../redis");
      const mockPipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 0],
          [null, 5], // zcard — at limit
          [null, 1],
          [null, 1],
        ]),
      };
      const mockRedis = {
        pipeline: vi.fn().mockReturnValue(mockPipeline),
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        zrange: vi.fn().mockResolvedValue([
          "entry",
          String(Date.now() - 30000), // 30s ago
        ]),
      };
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);

      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 5, windowMs: 60000 };

      const result = await checkRateLimitAsync(key, config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("falls back to in-memory on Redis error", async () => {
      const { getRedis } = await import("../redis");
      const mockPipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error("Connection refused")),
      };
      const mockRedis = { pipeline: vi.fn().mockReturnValue(mockPipeline) };
      vi.mocked(getRedis).mockReturnValue(mockRedis as never);

      const key = uniqueKey();
      const config: RateLimitConfig = { maxRequests: 5, windowMs: 60000 };

      const result = await checkRateLimitAsync(key, config);
      // Should succeed via in-memory fallback
      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Preset configs
  // -----------------------------------------------------------------------
  describe("RATE_LIMITS presets", () => {
    it("has read config: 100 req/min", () => {
      expect(RATE_LIMITS.read).toEqual({ maxRequests: 100, windowMs: 60000 });
    });

    it("has mutation config: 30 req/min", () => {
      expect(RATE_LIMITS.mutation).toEqual({ maxRequests: 30, windowMs: 60000 });
    });

    it("has chat config: 20 req/min", () => {
      expect(RATE_LIMITS.chat).toEqual({ maxRequests: 20, windowMs: 60000 });
    });

    it("has import config: 5 req/min", () => {
      expect(RATE_LIMITS.import).toEqual({ maxRequests: 5, windowMs: 60000 });
    });

    it("has auth config: 5 req/min (brute force protection)", () => {
      expect(RATE_LIMITS.auth).toEqual({ maxRequests: 5, windowMs: 60000 });
    });

    it("has api legacy alias: 100 req/min", () => {
      expect(RATE_LIMITS.api).toEqual({ maxRequests: 100, windowMs: 60000 });
    });
  });
});
