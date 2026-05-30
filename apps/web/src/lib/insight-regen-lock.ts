/**
 * Single-flight lock so an insight auto-regeneration runs ONCE per stale episode,
 * even when several visible tabs fire the auto-regen POST at grace-settle.
 *
 * Primary: Redis SET NX PX. Fallback: in-memory Map (single-instance best effort).
 */
import { getRedis } from "./redis";

const PREFIX = "burnless:insight-regen:";
const memory = new Map<string, number>(); // key -> expiresAt (ms)

export async function acquireRegenLock(
  companyId: string,
  page: string,
  ttlMs = 60_000
): Promise<boolean> {
  const key = `${PREFIX}${companyId}:${page}`;
  const redis = getRedis();
  if (redis) {
    try {
      const res = await redis.set(key, "1", "PX", ttlMs, "NX");
      return res === "OK";
    } catch {
      // fall through to memory
    }
  }
  const now = Date.now();
  const exp = memory.get(key);
  if (exp && exp > now) return false;
  memory.set(key, now + ttlMs);
  return true;
}
