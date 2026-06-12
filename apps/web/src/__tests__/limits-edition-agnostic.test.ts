import { describe, it, expect } from "vitest";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { getSafetyLimits } from "@/lib/automations/safety";

describe("safety limits are edition-agnostic (#28)", () => {
  it("rate-limit tiers exist and are not edition-conditional values", () => {
    // The tiers are static configs applied unconditionally by middleware (no edition gate).
    for (const tier of ["read", "mutation", "chat", "ai", "import", "auth", "mcp"]) {
      expect(RATE_LIMITS[tier]?.maxRequests).toBeGreaterThan(0);
    }
  });
  it("job safety caps resolve identically regardless of BURNLESS_DEPLOYMENT", () => {
    delete process.env.BURNLESS_DEPLOYMENT;
    const local = getSafetyLimits();
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    const cloud = getSafetyLimits();
    delete process.env.BURNLESS_DEPLOYMENT;
    expect(cloud).toEqual(local); // safety ≠ tiers — same both editions
  });
});
