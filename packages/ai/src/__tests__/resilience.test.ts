import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CircuitBreaker,
  RateLimiter,
  ResilientProvider,
  CircuitOpenError,
  RateLimitExceededError,
  isRetryableError,
  calculateBackoffDelay,
  withRetry,
  resetAllResilience,
  type RetryConfig,
  type RequestLog,
} from "../providers/resilience";
import { LlmProvider } from "../providers/base";
import type { CompletionRequest, LlmResponse, StreamEvent } from "../providers/types";

// ── Mock provider ──────────────────────────────────────────────────────────

class MockProvider extends LlmProvider {
  completeFn: (req: CompletionRequest) => Promise<LlmResponse>;
  streamFn: (req: CompletionRequest) => AsyncGenerator<StreamEvent>;

  constructor(
    completeFn?: (req: CompletionRequest) => Promise<LlmResponse>,
    streamFn?: (req: CompletionRequest) => AsyncGenerator<StreamEvent>
  ) {
    super({ model: "mock-model", apiKey: "test", maxTokens: 1024 });
    this.completeFn =
      completeFn ??
      (async () => ({
        content: [{ type: "text" as const, text: "ok" }],
        stopReason: "end_turn" as const,
        usage: { inputTokens: 10, outputTokens: 5 },
      }));
    this.streamFn =
      streamFn ??
      (async function* () {
        yield { type: "text_delta" as const, text: "ok" };
        yield {
          type: "done" as const,
          response: {
            content: [{ type: "text" as const, text: "ok" }],
            stopReason: "end_turn" as const,
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        };
      });
  }

  async complete(req: CompletionRequest): Promise<LlmResponse> {
    return this.completeFn(req);
  }

  async *stream(req: CompletionRequest): AsyncGenerator<StreamEvent> {
    yield* this.streamFn(req);
  }
}

const dummyRequest: CompletionRequest = {
  messages: [{ role: "user", content: "test" }],
};

// ── isRetryableError ───────────────────────────────────────────────────────

describe("isRetryableError", () => {
  it("returns true for rate limit errors (429)", () => {
    expect(isRetryableError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRetryableError(new Error("rate limit exceeded"))).toBe(true);
  });

  it("returns true for server errors (5xx)", () => {
    expect(isRetryableError(new Error("500 Internal Server Error"))).toBe(true);
    expect(isRetryableError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("returns true for network errors", () => {
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableError(new Error("socket hang up"))).toBe(true);
  });

  it("returns true for Anthropic overloaded errors", () => {
    expect(isRetryableError(new Error("overloaded"))).toBe(true);
  });

  it("returns true for SDK errors with status property", () => {
    const err = new Error("request failed");
    (err as unknown as { status: number }).status = 429;
    expect(isRetryableError(err)).toBe(true);

    const err500 = new Error("server error");
    (err500 as unknown as { status: number }).status = 500;
    expect(isRetryableError(err500)).toBe(true);
  });

  it("returns false for auth errors (401/403)", () => {
    expect(isRetryableError(new Error("401 Unauthorized"))).toBe(false);
    expect(isRetryableError(new Error("Invalid API key"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});

// ── calculateBackoffDelay ──────────────────────────────────────────────────

describe("calculateBackoffDelay", () => {
  const config: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30_000,
    jitterFactor: 0, // No jitter for deterministic tests
  };

  it("uses exponential backoff", () => {
    expect(calculateBackoffDelay(0, config)).toBe(1000); // 1000 * 2^0
    expect(calculateBackoffDelay(1, config)).toBe(2000); // 1000 * 2^1
    expect(calculateBackoffDelay(2, config)).toBe(4000); // 1000 * 2^2
  });

  it("caps at maxDelayMs", () => {
    expect(calculateBackoffDelay(10, config)).toBe(30_000); // Would be 1024000 without cap
  });

  it("applies jitter within bounds", () => {
    const jitterConfig = { ...config, jitterFactor: 1 };
    // With full jitter, delay should be between 0 and the exponential value
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoffDelay(0, jitterConfig);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });
});

// ── withRetry ──────────────────────────────────────────────────────────────

describe("withRetry", () => {
  const fastConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1, // 1ms for fast tests
    maxDelayMs: 10,
    jitterFactor: 0,
  };

  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, fastConfig);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockRejectedValueOnce(new Error("503 unavailable"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, fastConfig);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));

    await expect(withRetry(fn, fastConfig)).rejects.toThrow("401 Unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503 server error"));

    await expect(withRetry(fn, fastConfig)).rejects.toThrow("503 server error");
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValue("ok");

    await withRetry(fn, fastConfig, onRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
  });
});

// ── CircuitBreaker ─────────────────────────────────────────────────────────

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker("test", {
      failureThreshold: 3,
      cooldownMs: 100,
      halfOpenSuccesses: 2,
    });
  });

  it("starts in closed state", () => {
    expect(cb.getState()).toBe("closed");
    expect(cb.isAllowed()).toBe(true);
  });

  it("opens after reaching failure threshold", () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("closed");

    cb.recordFailure(); // 3rd failure = threshold
    expect(cb.getState()).toBe("open");
    expect(cb.isAllowed()).toBe(false);
  });

  it("resets failure count on success", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess(); // resets count
    cb.recordFailure();
    cb.recordFailure();
    // Only 2 consecutive failures, not 3
    expect(cb.getState()).toBe("closed");
  });

  it("transitions to half-open after cooldown", async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 120));
    expect(cb.getState()).toBe("half_open");
    expect(cb.isAllowed()).toBe(true);
  });

  it("closes after enough successes in half-open", async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    await new Promise((r) => setTimeout(r, 120));

    expect(cb.getState()).toBe("half_open");
    cb.recordSuccess();
    expect(cb.getState()).toBe("half_open"); // Need 2 successes
    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");
  });

  it("re-opens on failure in half-open state", async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    await new Promise((r) => setTimeout(r, 120));

    expect(cb.getState()).toBe("half_open");
    cb.recordFailure(); // Any failure in half-open re-opens
    expect(cb.getState()).toBe("open");
  });

  it("reset clears all state", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    cb.reset();
    expect(cb.getState()).toBe("closed");
    expect(cb.getStats().failureCount).toBe(0);
  });

  it("getStats returns diagnostic info", () => {
    cb.recordFailure();
    cb.recordFailure();
    const stats = cb.getStats();
    expect(stats.state).toBe("closed");
    expect(stats.failureCount).toBe(2);
  });
});

// ── RateLimiter ────────────────────────────────────────────────────────────

describe("RateLimiter", () => {
  it("allows requests within limit", () => {
    const rl = new RateLimiter("test", { maxRequests: 3, windowMs: 1000 });
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(false); // 4th request blocked
  });

  it("reports remaining correctly", () => {
    const rl = new RateLimiter("test", { maxRequests: 5, windowMs: 1000 });
    expect(rl.remaining()).toBe(5);
    rl.tryAcquire();
    expect(rl.remaining()).toBe(4);
  });

  it("allows requests after window expires", async () => {
    const rl = new RateLimiter("test", { maxRequests: 1, windowMs: 50 });
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(false);

    await new Promise((r) => setTimeout(r, 60));
    expect(rl.tryAcquire()).toBe(true);
  });

  it("reset clears all timestamps", () => {
    const rl = new RateLimiter("test", { maxRequests: 2, windowMs: 10000 });
    rl.tryAcquire();
    rl.tryAcquire();
    expect(rl.remaining()).toBe(0);
    rl.reset();
    expect(rl.remaining()).toBe(2);
  });
});

// ── ResilientProvider ──────────────────────────────────────────────────────

describe("ResilientProvider", () => {
  beforeEach(() => {
    resetAllResilience();
  });

  it("passes through successful completion", async () => {
    const mock = new MockProvider();
    const provider = new ResilientProvider(mock, "test", {
      rateLimiter: { maxRequests: 100, windowMs: 60_000 },
    });

    const result = await provider.complete(dummyRequest);
    expect(result.content[0]).toEqual({ type: "text", text: "ok" });
  });

  it("retries transient errors on complete", async () => {
    let callCount = 0;
    const mock = new MockProvider(async () => {
      callCount++;
      if (callCount <= 2) throw new Error("503 service unavailable");
      return {
        content: [{ type: "text" as const, text: "recovered" }],
        stopReason: "end_turn" as const,
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    });

    const provider = new ResilientProvider(mock, "test", {
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5, jitterFactor: 0 },
      rateLimiter: { maxRequests: 100, windowMs: 60_000 },
    });

    const result = await provider.complete(dummyRequest);
    expect(result.content[0]).toEqual({ type: "text", text: "recovered" });
    expect(callCount).toBe(3);
  });

  it("throws CircuitOpenError when circuit is open", async () => {
    let callCount = 0;
    const mock = new MockProvider(async () => {
      callCount++;
      throw new Error("503 server error");
    });

    const provider = new ResilientProvider(mock, "test", {
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5, jitterFactor: 0 },
      circuitBreaker: { failureThreshold: 2, cooldownMs: 60_000, halfOpenSuccesses: 1 },
      rateLimiter: { maxRequests: 100, windowMs: 60_000 },
    });

    // Trigger failures to open circuit
    await expect(provider.complete(dummyRequest)).rejects.toThrow();
    await expect(provider.complete(dummyRequest)).rejects.toThrow();

    // Next call should get CircuitOpenError without hitting provider
    const prevCount = callCount;
    await expect(provider.complete(dummyRequest)).rejects.toThrow(CircuitOpenError);
    expect(callCount).toBe(prevCount); // Provider not called
  });

  it("throws RateLimitExceededError when rate limited", async () => {
    const mock = new MockProvider();
    const provider = new ResilientProvider(mock, "test", {
      rateLimiter: { maxRequests: 1, windowMs: 60_000 },
    });

    await provider.complete(dummyRequest); // First call OK
    await expect(provider.complete(dummyRequest)).rejects.toThrow(
      RateLimitExceededError
    );
  });

  it("emits request logs on success", async () => {
    const logs: RequestLog[] = [];
    const mock = new MockProvider();
    const provider = new ResilientProvider(mock, "test", {
      rateLimiter: { maxRequests: 100, windowMs: 60_000 },
      onRequest: (log) => logs.push(log),
    }, "chat");

    await provider.complete(dummyRequest);

    expect(logs).toHaveLength(1);
    expect(logs[0]!.success).toBe(true);
    expect(logs[0]!.provider).toBe("test");
    expect(logs[0]!.model).toBe("mock-model");
    expect(logs[0]!.feature).toBe("chat");
    expect(logs[0]!.inputTokens).toBe(10);
    expect(logs[0]!.outputTokens).toBe(5);
    expect(logs[0]!.circuitState).toBe("closed");
  });

  it("emits request logs on failure", async () => {
    const logs: RequestLog[] = [];
    const mock = new MockProvider(async () => {
      throw new Error("401 Unauthorized");
    });
    const provider = new ResilientProvider(mock, "test", {
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 5, jitterFactor: 0 },
      rateLimiter: { maxRequests: 100, windowMs: 60_000 },
      onRequest: (log) => logs.push(log),
    });

    await expect(provider.complete(dummyRequest)).rejects.toThrow();

    expect(logs).toHaveLength(1);
    expect(logs[0]!.success).toBe(false);
    expect(logs[0]!.error).toContain("401");
  });

  it("streams through successfully", async () => {
    const mock = new MockProvider();
    const provider = new ResilientProvider(mock, "test", {
      rateLimiter: { maxRequests: 100, windowMs: 60_000 },
    });

    const events: StreamEvent[] = [];
    for await (const event of provider.stream(dummyRequest)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("text_delta");
    expect(events[1]!.type).toBe("done");
  });

  it("exposes circuit stats and rate limit remaining", async () => {
    const mock = new MockProvider();
    const provider = new ResilientProvider(mock, "test", {
      rateLimiter: { maxRequests: 10, windowMs: 60_000 },
    });

    expect(provider.getCircuitStats().state).toBe("closed");
    expect(provider.getRateLimitRemaining()).toBe(10);

    await provider.complete(dummyRequest);
    expect(provider.getRateLimitRemaining()).toBe(9);
  });

  it("preserves modelId from inner provider", () => {
    const mock = new MockProvider();
    const provider = new ResilientProvider(mock, "test", {
      rateLimiter: { maxRequests: 100, windowMs: 60_000 },
    });
    expect(provider.modelId).toBe("mock-model");
  });
});
