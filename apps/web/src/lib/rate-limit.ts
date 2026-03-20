/**
 * In-memory sliding window rate limiter.
 * For production, replace with Redis-backed implementation.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
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

/**
 * Check if a request is within rate limits.
 * @param key Unique identifier (e.g., userId, IP, or userId:endpoint)
 * @param config Rate limit configuration
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

  // Remove timestamps outside the window
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

// Pre-defined rate limit configs
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  /** Read API: 100 req/min per IP */
  read: { maxRequests: 100, windowMs: 60_000 },
  /** Mutation API (POST/PUT/PATCH/DELETE): 30 req/min per IP */
  mutation: { maxRequests: 30, windowMs: 60_000 },
  /** AI chat: 20 req/min per user */
  chat: { maxRequests: 20, windowMs: 60_000 },
  /** Import: 5 req/min per user */
  import: { maxRequests: 5, windowMs: 60_000 },
  /** Auth (register, check-email): 5 req/min per IP — brute force protection */
  auth: { maxRequests: 5, windowMs: 60_000 },
  /** Legacy alias */
  api: { maxRequests: 100, windowMs: 60_000 },
};
