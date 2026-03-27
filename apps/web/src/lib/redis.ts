/**
 * Redis client singleton for server-side use (Node.js runtime only).
 *
 * Connects lazily on first use. Returns null when REDIS_URL is not set,
 * letting callers fall back to in-memory implementations.
 */
import Redis from "ioredis";

let client: Redis | null = null;
let connectionFailed = false;

/**
 * Get a shared Redis client. Returns null if:
 * - REDIS_URL is not configured
 * - A previous connection attempt failed (avoids retry storms)
 */
export function getRedis(): Redis | null {
  if (connectionFailed) return null;
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        // Retry once quickly, then stop — don't block request handling
        if (times > 1) {
          connectionFailed = true;
          return null;
        }
        return 200;
      },
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 1000,
    });

    client.on("error", () => {
      // Silently mark as failed — callers fall back to in-memory
      connectionFailed = true;
      client?.disconnect();
      client = null;
    });

    // Start connecting (non-blocking)
    client.connect().catch(() => {
      connectionFailed = true;
      client = null;
    });

    return client;
  } catch {
    connectionFailed = false;
    return null;
  }
}

/**
 * Reset connection state — useful for testing or after config changes.
 */
export function resetRedis(): void {
  client?.disconnect();
  client = null;
  connectionFailed = false;
}
