/**
 * Resilience primitives for LLM providers.
 *
 * Three composable patterns:
 *   1. RetryWithBackoff — exponential backoff + jitter for transient failures
 *   2. CircuitBreaker — prevent cascading failures when a provider is down
 *   3. RateLimiter — token-bucket rate limiting per provider
 *
 * These are composed into ResilientProvider which wraps any LlmProvider.
 */

import { LlmProvider } from "./base";
import type {
  CompletionRequest,
  LlmResponse,
  StreamEvent,
} from "./types";

// ── Retry with exponential backoff ─────────────────────────────────────────

export interface RetryConfig {
  /** Max number of retry attempts (not counting the initial attempt). */
  maxRetries: number;
  /** Base delay in ms before first retry. */
  baseDelayMs: number;
  /** Maximum delay cap in ms. */
  maxDelayMs: number;
  /** Jitter factor (0-1). 0 = no jitter, 1 = full jitter. */
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterFactor: 1,
};

/** Thrown when a stream completes with no usable content (no text, no tool calls).
 *  Transient with small models / large tool payloads; safe to retry (nothing was
 *  streamed to the client yet). */
export class EmptyCompletionError extends Error {
  constructor(model: string) {
    super(`Empty completion from model "${model}" (no text or tool calls)`);
    this.name = "EmptyCompletionError";
  }
}

/** Returns true if the error is retryable (rate limit, server error, network). */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof EmptyCompletionError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Rate limit errors (HTTP 429)
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
      return true;
    }

    // Server errors (5xx)
    if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
      return true;
    }
    if (msg.includes("internal server error") || msg.includes("bad gateway") || msg.includes("service unavailable")) {
      return true;
    }

    // Network errors
    if (msg.includes("econnreset") || msg.includes("econnrefused") || msg.includes("etimedout")) {
      return true;
    }
    if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("socket hang up")) {
      return true;
    }

    // Overloaded (Anthropic-specific)
    if (msg.includes("overloaded")) {
      return true;
    }

    // Check for status property on error objects (SDK errors)
    const errWithStatus = error as { status?: number };
    if (errWithStatus.status && errWithStatus.status >= 429) {
      return errWithStatus.status === 429 || errWithStatus.status >= 500;
    }
  }

  return false;
}

/** Calculate delay for a retry attempt with exponential backoff + jitter. */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  // Exponential: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Full jitter: random between 0 and cappedDelay
  const jitter = config.jitterFactor * cappedDelay * Math.random();
  const deterministicPart = (1 - config.jitterFactor) * cappedDelay;

  return Math.round(deterministicPart + jitter);
}

/** Extract retry-after hint from error (seconds or ms). */
function getRetryAfterMs(error: unknown): number | null {
  const errObj = error as { headers?: Record<string, string>; error?: { message?: string } };

  // Check for retry-after header
  const retryAfter = errObj.headers?.["retry-after"];
  if (retryAfter) {
    const seconds = parseFloat(retryAfter);
    if (!isNaN(seconds)) return seconds * 1000;
  }

  return null;
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 * Retries on transient errors with exponential backoff + jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= config.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      // Use retry-after header if available, otherwise calculate backoff
      const retryAfterMs = getRetryAfterMs(error);
      const backoffMs = retryAfterMs ?? calculateBackoffDelay(attempt, config);

      onRetry?.(attempt + 1, error, backoffMs);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

// ── Circuit Breaker ────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before trying half-open (ms). */
  cooldownMs: number;
  /** Number of successes in half-open state needed to close the circuit. */
  halfOpenSuccesses: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60_000,
  halfOpenSuccesses: 2,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  readonly name: string;

  constructor(name: string, config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    this.name = name;
    this.config = config;
  }

  /** Get the current circuit state (checks for cooldown expiry). */
  getState(): CircuitState {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.cooldownMs) {
        this.state = "half_open";
        this.successCount = 0;
      }
    }
    return this.state;
  }

  /** Check if requests are allowed through. */
  isAllowed(): boolean {
    const state = this.getState();
    return state !== "open";
  }

  /** Record a successful request. */
  recordSuccess(): void {
    if (this.state === "half_open") {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenSuccesses) {
        this.state = "closed";
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  /** Record a failed request. */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "half_open") {
      // Any failure in half-open re-opens the circuit
      this.state = "open";
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = "open";
    }
  }

  /** Reset the circuit breaker to closed state. */
  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /** Get diagnostics for logging. */
  getStats(): { state: CircuitState; failureCount: number; successCount: number } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }
}

// ── Rate Limiter (Token Bucket) ────────────────────────────────────────────

export interface RateLimiterConfig {
  /** Maximum requests allowed in the window. */
  maxRequests: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxRequests: 50,
  windowMs: 60_000,
};

export class RateLimiter {
  private timestamps: number[] = [];
  private config: RateLimiterConfig;
  readonly name: string;

  constructor(name: string, config: RateLimiterConfig = DEFAULT_RATE_LIMITER_CONFIG) {
    this.name = name;
    this.config = config;
  }

  /** Check if a request is allowed. If so, records it. */
  tryAcquire(): boolean {
    this.pruneOldEntries();
    if (this.timestamps.length >= this.config.maxRequests) {
      return false;
    }
    this.timestamps.push(Date.now());
    return true;
  }

  /** Wait until a slot is available, then acquire it. */
  async waitForSlot(): Promise<void> {
    while (!this.tryAcquire()) {
      // Wait until the oldest entry expires
      const oldest = this.timestamps[0];
      if (oldest) {
        const waitMs = oldest + this.config.windowMs - Date.now() + 1;
        if (waitMs > 0) {
          await sleep(waitMs);
        }
      }
    }
  }

  /** How many requests are remaining in the current window. */
  remaining(): number {
    this.pruneOldEntries();
    return Math.max(0, this.config.maxRequests - this.timestamps.length);
  }

  /** Reset the rate limiter. */
  reset(): void {
    this.timestamps = [];
  }

  private pruneOldEntries(): void {
    const cutoff = Date.now() - this.config.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! < cutoff) {
      this.timestamps.shift();
    }
  }
}

// ── Circuit Breaker Error ──────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  readonly circuitName: string;

  constructor(circuitName: string) {
    super(`Circuit breaker "${circuitName}" is open — provider unavailable`);
    this.name = "CircuitOpenError";
    this.circuitName = circuitName;
  }
}

export class RateLimitExceededError extends Error {
  readonly limiterName: string;

  constructor(limiterName: string) {
    super(`Rate limit exceeded for "${limiterName}"`);
    this.name = "RateLimitExceededError";
    this.limiterName = limiterName;
  }
}

// ── Resilience Config ──────────────────────────────────────────────────────

export interface ResilienceConfig {
  retry?: RetryConfig;
  circuitBreaker?: CircuitBreakerConfig;
  rateLimiter?: RateLimiterConfig;
  /** Log function for structured request logging. */
  onRequest?: (log: RequestLog) => void;
}

export interface RequestLog {
  provider: string;
  model: string;
  feature?: string;
  durationMs: number;
  success: boolean;
  attempt: number;
  error?: string;
  circuitState: CircuitState;
  rateLimitRemaining: number;
  inputTokens?: number;
  outputTokens?: number;
}

// ── Resilient Provider ─────────────────────────────────────────────────────

/**
 * Wraps any LlmProvider with retry, circuit breaker, and rate limiting.
 *
 * Composition order (outer → inner):
 *   Rate limiter → Circuit breaker → Retry → Actual provider call
 */
export class ResilientProvider extends LlmProvider {
  private inner: LlmProvider;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private retryConfig: RetryConfig;
  private providerName: string;
  private feature?: string;
  private logFn?: (log: RequestLog) => void;

  constructor(
    inner: LlmProvider,
    providerName: string,
    config: ResilienceConfig = {},
    feature?: string
  ) {
    super({ model: inner.modelId, apiKey: "", maxTokens: 4096 });
    this.inner = inner;
    this.providerName = providerName;
    this.feature = feature;
    this.retryConfig = config.retry ?? DEFAULT_RETRY_CONFIG;
    this.circuitBreaker = new CircuitBreaker(
      providerName,
      config.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER_CONFIG
    );
    this.rateLimiter = new RateLimiter(
      providerName,
      config.rateLimiter ?? DEFAULT_RATE_LIMITER_CONFIG
    );
    this.logFn = config.onRequest;
  }

  async complete(request: CompletionRequest): Promise<LlmResponse> {
    // 1. Rate limit check
    if (!this.rateLimiter.tryAcquire()) {
      this.emitLog(0, false, 0, "Rate limit exceeded");
      throw new RateLimitExceededError(this.providerName);
    }

    // 2. Circuit breaker check
    if (!this.circuitBreaker.isAllowed()) {
      this.emitLog(0, false, 0, "Circuit open");
      throw new CircuitOpenError(this.providerName);
    }

    // 3. Retry with backoff
    const start = Date.now();
    let finalAttempt = 0;

    try {
      const response = await withRetry(
        () => this.inner.complete(request),
        this.retryConfig,
        (attempt, error, delayMs) => {
          finalAttempt = attempt;
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(
            `[resilience] ${this.providerName} attempt ${attempt}/${this.retryConfig.maxRetries} failed: ${msg}. Retrying in ${delayMs}ms...`
          );
        }
      );

      this.circuitBreaker.recordSuccess();
      this.emitLog(
        finalAttempt,
        true,
        Date.now() - start,
        undefined,
        response.usage?.inputTokens,
        response.usage?.outputTokens
      );

      return response;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      const msg = error instanceof Error ? error.message : String(error);
      this.emitLog(finalAttempt, false, Date.now() - start, msg);
      throw error;
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    // 1. Rate limit check
    if (!this.rateLimiter.tryAcquire()) {
      this.emitLog(0, false, 0, "Rate limit exceeded");
      throw new RateLimitExceededError(this.providerName);
    }

    // 2. Circuit breaker check
    if (!this.circuitBreaker.isAllowed()) {
      this.emitLog(0, false, 0, "Circuit open");
      throw new CircuitOpenError(this.providerName);
    }

    // 3. For streaming, we retry the connection but not mid-stream.
    //    If the stream fails to start, retry. Once streaming, errors propagate.
    const start = Date.now();
    let finalAttempt = 0;

    let generator: AsyncGenerator<StreamEvent>;
    try {
      generator = await withRetry(
        async () => {
          const gen = this.inner.stream(request);
          // Pull the first event to verify the connection works
          const first = await gen.next();
          return { gen, first };
        },
        this.retryConfig,
        (attempt, error, delayMs) => {
          finalAttempt = attempt;
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(
            `[resilience] ${this.providerName} stream attempt ${attempt}/${this.retryConfig.maxRetries} failed: ${msg}. Retrying in ${delayMs}ms...`
          );
        }
      ).then(({ gen, first }) => {
        // Create a new generator that yields the first event then the rest
        return (async function* () {
          if (!first.done) yield first.value;
          yield* gen;
        })();
      });
    } catch (error) {
      this.circuitBreaker.recordFailure();
      const msg = error instanceof Error ? error.message : String(error);
      this.emitLog(finalAttempt, false, Date.now() - start, msg);
      throw error;
    }

    // Stream events, tracking the done event for logging
    try {
      for await (const event of generator) {
        if (event.type === "done") {
          this.circuitBreaker.recordSuccess();
          this.emitLog(
            finalAttempt,
            true,
            Date.now() - start,
            undefined,
            event.response.usage?.inputTokens,
            event.response.usage?.outputTokens
          );
        }
        yield event;
      }
    } catch (error) {
      this.circuitBreaker.recordFailure();
      const msg = error instanceof Error ? error.message : String(error);
      this.emitLog(finalAttempt, false, Date.now() - start, msg);
      throw error;
    }
  }

  override get modelId(): string {
    return this.inner.modelId;
  }

  /** Expose circuit breaker stats for monitoring. */
  getCircuitStats() {
    return this.circuitBreaker.getStats();
  }

  /** Expose rate limiter remaining for monitoring. */
  getRateLimitRemaining(): number {
    return this.rateLimiter.remaining();
  }

  private emitLog(
    attempt: number,
    success: boolean,
    durationMs: number,
    error?: string,
    inputTokens?: number,
    outputTokens?: number
  ): void {
    this.logFn?.({
      provider: this.providerName,
      model: this.inner.modelId,
      feature: this.feature,
      durationMs,
      success,
      attempt,
      error,
      circuitState: this.circuitBreaker.getState(),
      rateLimitRemaining: this.rateLimiter.remaining(),
      inputTokens,
      outputTokens,
    });
  }
}

// ── Shared circuit breakers / rate limiters per provider ────────────────────

const circuitBreakers = new Map<string, CircuitBreaker>();
const rateLimiters = new Map<string, RateLimiter>();

/** Get or create a shared circuit breaker for a provider. */
export function getCircuitBreaker(
  providerName: string,
  config?: CircuitBreakerConfig
): CircuitBreaker {
  let cb = circuitBreakers.get(providerName);
  if (!cb) {
    cb = new CircuitBreaker(providerName, config);
    circuitBreakers.set(providerName, cb);
  }
  return cb;
}

/** Get or create a shared rate limiter for a provider. */
export function getRateLimiter(
  providerName: string,
  config?: RateLimiterConfig
): RateLimiter {
  let rl = rateLimiters.get(providerName);
  if (!rl) {
    rl = new RateLimiter(providerName, config);
    rateLimiters.set(providerName, rl);
  }
  return rl;
}

/** Reset all shared instances (for testing). */
export function resetAllResilience(): void {
  circuitBreakers.clear();
  rateLimiters.clear();
}

/** Health status for a single provider. */
export interface ProviderHealthStatus {
  provider: string;
  circuit: { state: CircuitState; failureCount: number; successCount: number };
  rateLimit: { remaining: number; maxRequests: number; windowMs: number };
}

/** Get health status for all active providers. */
export function getAllProviderHealth(): ProviderHealthStatus[] {
  const providers = new Set([
    ...circuitBreakers.keys(),
    ...rateLimiters.keys(),
  ]);

  return Array.from(providers).map((name) => {
    const cb = circuitBreakers.get(name);
    const rl = rateLimiters.get(name);
    const rlConfig = PROVIDER_RATE_LIMITS[name] ?? DEFAULT_RATE_LIMITER_CONFIG;

    return {
      provider: name,
      circuit: cb
        ? cb.getStats()
        : { state: "closed" as CircuitState, failureCount: 0, successCount: 0 },
      rateLimit: {
        remaining: rl ? rl.remaining() : rlConfig.maxRequests,
        maxRequests: rlConfig.maxRequests,
        windowMs: rlConfig.windowMs,
      },
    };
  });
}

// ── Per-provider rate limit configs ────────────────────────────────────────

const PROVIDER_RATE_LIMITS: Record<string, RateLimiterConfig> = {
  anthropic: { maxRequests: 50, windowMs: 60_000 },
  openai: { maxRequests: 60, windowMs: 60_000 },
  openrouter: { maxRequests: 40, windowMs: 60_000 },
};

/** Get the rate limit config for a provider (with sane defaults). */
export function getProviderRateLimitConfig(
  providerName: string
): RateLimiterConfig {
  return PROVIDER_RATE_LIMITS[providerName] ?? DEFAULT_RATE_LIMITER_CONFIG;
}
