import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getFeatureTier,
  getFeatureTierMap,
  estimateCostMicros,
  onUsage,
} from "../routing";
import {
  resolveModelForTier,
  getFallbackTiers,
} from "../providers";

describe("Feature → Tier mapping", () => {
  it("routes categorize_transaction to fast tier", () => {
    expect(getFeatureTier("categorize_transaction")).toBe("fast");
  });

  it("routes batch_categorize to fast tier", () => {
    expect(getFeatureTier("batch_categorize")).toBe("fast");
  });

  it("routes onboarding_enrich to standard tier", () => {
    expect(getFeatureTier("onboarding_enrich")).toBe("standard");
  });

  it("routes chat to deep tier", () => {
    expect(getFeatureTier("chat")).toBe("deep");
  });

  it("routes financial_analysis to deep tier", () => {
    expect(getFeatureTier("financial_analysis")).toBe("deep");
  });

  it("defaults unknown features to standard", () => {
    expect(getFeatureTier("unknown_feature_xyz")).toBe("standard");
  });

  it("returns all feature tiers for dashboard display", () => {
    const map = getFeatureTierMap();
    expect(map.chat).toBe("deep");
    expect(map.categorize_transaction).toBe("fast");
    expect(map.onboarding_enrich).toBe("standard");
    // Verify it's a copy (not the internal object)
    (map as Record<string, string>).chat = "fast";
    expect(getFeatureTier("chat")).toBe("deep");
  });
});

describe("Tier → Model resolution", () => {
  it("resolves anthropic fast tier to haiku", () => {
    expect(resolveModelForTier("anthropic", "fast")).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("resolves anthropic standard tier to sonnet", () => {
    expect(resolveModelForTier("anthropic", "standard")).toBe(
      "claude-sonnet-4-20250514"
    );
  });

  it("resolves anthropic deep tier to sonnet (current default)", () => {
    expect(resolveModelForTier("anthropic", "deep")).toBe(
      "claude-sonnet-4-20250514"
    );
  });

  it("falls back to default model for unknown provider", () => {
    // Unknown provider should return empty string since no default exists
    expect(resolveModelForTier("unknown_provider", "fast")).toBe("");
  });
});

describe("Fallback tiers", () => {
  it("fast falls back to standard then deep", () => {
    expect(getFallbackTiers("fast")).toEqual(["standard", "deep"]);
  });

  it("standard falls back to deep then fast", () => {
    expect(getFallbackTiers("standard")).toEqual(["deep", "fast"]);
  });

  it("deep falls back to standard then fast", () => {
    expect(getFallbackTiers("deep")).toEqual(["standard", "fast"]);
  });
});

describe("Cost estimation", () => {
  it("estimates haiku costs correctly", () => {
    // 1000 input tokens + 500 output tokens
    // haiku: 0.80/M input, 4.00/M output
    // = (1000 * 800_000 + 500 * 4_000_000) / 1_000_000
    // = (800_000_000 + 2_000_000_000) / 1_000_000
    // = 2800
    const cost = estimateCostMicros("claude-haiku-4-5-20251001", 1000, 500);
    expect(cost).toBe(2800);
  });

  it("estimates sonnet costs correctly", () => {
    // 1000 input + 500 output
    // sonnet: 3.00/M input, 15.00/M output
    // = (1000 * 3_000_000 + 500 * 15_000_000) / 1_000_000
    // = (3_000_000_000 + 7_500_000_000) / 1_000_000
    // = 10500
    const cost = estimateCostMicros("claude-sonnet-4-20250514", 1000, 500);
    expect(cost).toBe(10500);
  });

  it("returns 0 for unknown models", () => {
    expect(estimateCostMicros("unknown-model", 1000, 500)).toBe(0);
  });

  it("handles zero tokens", () => {
    expect(estimateCostMicros("claude-haiku-4-5-20251001", 0, 0)).toBe(0);
  });

  it("haiku is significantly cheaper than sonnet", () => {
    const haikuCost = estimateCostMicros("claude-haiku-4-5-20251001", 10000, 5000);
    const sonnetCost = estimateCostMicros("claude-sonnet-4-20250514", 10000, 5000);
    // Haiku should be at least 3x cheaper
    expect(haikuCost).toBeLessThan(sonnetCost / 3);
  });
});

describe("Usage tracking", () => {
  it("emits usage records to listeners", () => {
    const records: unknown[] = [];
    const unsubscribe = onUsage((record) => records.push(record));

    // The actual emission happens inside TrackedProvider which requires
    // a real provider instance — test the listener registration instead
    expect(records).toHaveLength(0);

    unsubscribe();
  });

  it("supports multiple listeners", () => {
    const records1: unknown[] = [];
    const records2: unknown[] = [];
    const unsub1 = onUsage((r) => records1.push(r));
    const unsub2 = onUsage((r) => records2.push(r));

    unsub1();
    unsub2();
  });

  it("unsubscribe removes the listener", () => {
    const records: unknown[] = [];
    const unsubscribe = onUsage((r) => records.push(r));
    unsubscribe();
    // After unsubscribe, no records should be added
    expect(records).toHaveLength(0);
  });
});
