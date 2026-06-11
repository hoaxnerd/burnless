/**
 * Tiered rate limiter with Redis-backed sliding window.
 *
 * Two modes:
 *   1. `checkRateLimit` — synchronous, in-memory (used by Edge middleware)
 *   2. `checkRateLimitAsync` — async, Redis-first with in-memory fallback
 *      (used by route handlers running in Node.js runtime)
 */
// Dynamic import to avoid loading ioredis in Edge middleware runtime.
// Only checkRateLimitAsync (Node.js route handlers) needs Redis.
async function getRedisLazy() {
  const { getRedis } = await import("./redis");
  return getRedis();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum requests allowed in the window. */
  maxRequests: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ---------------------------------------------------------------------------
// In-memory store (Edge-compatible, per-process)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

/**
 * Synchronous in-memory sliding window check.
 * Used by Edge middleware where async Redis calls aren't possible.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  cleanup(config.windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < config.windowMs
  );

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0]!;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestInWindow + config.windowMs,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetAt: now + config.windowMs,
  };
}

// ---------------------------------------------------------------------------
// Redis sliding window (ZSET-based)
// ---------------------------------------------------------------------------

/**
 * Async rate limit check using Redis sorted sets for sliding window.
 * Falls back to in-memory when Redis is unavailable.
 *
 * Algorithm: Store timestamps as ZSET scores. On each request:
 *   1. Remove expired entries (score < now - windowMs)
 *   2. Count remaining entries
 *   3. If under limit, add current timestamp
 *   4. Set TTL on the key for auto-cleanup
 */
export async function checkRateLimitAsync(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = await getRedisLazy();
  if (!redis) {
    return checkRateLimit(key, config);
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const redisKey = `rl:${key}`;

  try {
    const pipeline = redis.pipeline();
    // 1. Remove expired entries
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    // 2. Count current entries
    pipeline.zcard(redisKey);
    // 3. Add current timestamp (we'll remove it if over limit)
    pipeline.zadd(redisKey, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
    // 4. Set TTL for auto-cleanup (window + buffer)
    pipeline.pexpire(redisKey, config.windowMs + 1000);

    const results = await pipeline.exec();
    if (!results) {
      return checkRateLimit(key, config);
    }

    // results[1] = [err, count] from zcard (before adding current request)
    const countBeforeAdd = (results[1]?.[1] as number) ?? 0;

    if (countBeforeAdd >= config.maxRequests) {
      // Over limit — remove the entry we just added
      const lastResult = results[2];
      if (lastResult) {
        // Remove the member we just added by getting the last one
        redis.zremrangebyscore(redisKey, now, now).catch(() => {});
      }

      // Get oldest entry to calculate reset time
      const oldest = await redis.zrange(redisKey, 0, 0, "WITHSCORES");
      const resetAt = oldest.length >= 2
        ? Number(oldest[1]) + config.windowMs
        : now + config.windowMs;

      return { allowed: false, remaining: 0, resetAt };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - countBeforeAdd - 1,
      resetAt: now + config.windowMs,
    };
  } catch {
    // Redis error — fall back to in-memory
    return checkRateLimit(key, config);
  }
}

// ---------------------------------------------------------------------------
// Pre-defined rate limit configs
// ---------------------------------------------------------------------------

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  /** Read API: 100 req/min per IP */
  read: { maxRequests: 100, windowMs: 60_000 },
  /** Mutation API (POST/PUT/PATCH/DELETE): 30 req/min per IP */
  mutation: { maxRequests: 30, windowMs: 60_000 },
  /** AI chat: 20 req/min per user */
  chat: { maxRequests: 20, windowMs: 60_000 },
  /** AI generation (insights, scenario AI, onboarding enrich): 10 req/min */
  ai: { maxRequests: 10, windowMs: 60_000 },
  /** Heavy compute (metrics, statements, scenario compare): 15 req/min */
  heavy: { maxRequests: 15, windowMs: 60_000 },
  /** Import: 5 req/min per user */
  import: { maxRequests: 5, windowMs: 60_000 },
  /** Auth (register, check-email): 5 req/min per IP — brute force protection */
  auth: { maxRequests: 5, windowMs: 60_000 },
  /** Inbound MCP server: 60 req/min per credential (token-hash key, expose spec §4.1) */
  mcp: { maxRequests: 60, windowMs: 60_000 },
  /**
   * Inbound MCP per-IP backstop. The credential key is attacker-controlled
   * (rotating a random bearer mints a fresh bucket per request), so a second
   * IP-keyed cap bounds total /mcp throughput — and thus the route's
   * sha256+DB token lookups — regardless of header churn. Higher than the
   * per-credential cap so multiple legitimate tokens behind one NAT coexist.
   */
  mcpIp: { maxRequests: 240, windowMs: 60_000 },
  /** Legacy alias */
  api: { maxRequests: 100, windowMs: 60_000 },
};
