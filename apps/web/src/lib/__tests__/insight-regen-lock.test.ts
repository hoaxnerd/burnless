import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis", () => ({ getRedis: () => null })); // force in-memory path

import { acquireRegenLock } from "../insight-regen-lock";

describe("acquireRegenLock (in-memory fallback)", () => {
  beforeEach(() => vi.useRealTimers());

  it("grants the first acquire and denies a second within TTL", async () => {
    const a = await acquireRegenLock("co-lock-1", "expenses", 60_000);
    const b = await acquireRegenLock("co-lock-1", "expenses", 60_000);
    expect(a).toBe(true);
    expect(b).toBe(false);
  });

  it("scopes locks per company+page", async () => {
    expect(await acquireRegenLock("co-lock-2", "expenses", 60_000)).toBe(true);
    expect(await acquireRegenLock("co-lock-2", "dashboard", 60_000)).toBe(true);
    expect(await acquireRegenLock("co-lock-3", "expenses", 60_000)).toBe(true);
  });

  it("re-grants after the TTL elapses", async () => {
    expect(await acquireRegenLock("co-lock-4", "expenses", 5)).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(await acquireRegenLock("co-lock-4", "expenses", 5)).toBe(true);
  });
});
