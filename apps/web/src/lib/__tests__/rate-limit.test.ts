import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from "../rate-limit";

describe("rate-limit", () => {
  // Use unique keys per test to avoid cross-contamination
  let testKey = 0;
  function uniqueKey() {
    return `test-${++testKey}-${Date.now()}`;
  }

  describe("checkRateLimit", () => {
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

  describe("RATE_LIMITS presets", () => {
    it("has api config: 100 req/min", () => {
      expect(RATE_LIMITS.api).toEqual({ maxRequests: 100, windowMs: 60000 });
    });

    it("has chat config: 20 req/min", () => {
      expect(RATE_LIMITS.chat).toEqual({ maxRequests: 20, windowMs: 60000 });
    });

    it("has import config: 5 req/min", () => {
      expect(RATE_LIMITS.import).toEqual({ maxRequests: 5, windowMs: 60000 });
    });

    it("has auth config: 10 req/min", () => {
      expect(RATE_LIMITS.auth).toEqual({ maxRequests: 10, windowMs: 60000 });
    });
  });
});
