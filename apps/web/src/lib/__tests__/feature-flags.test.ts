import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockGetFeatureFlag, mockGetAllFlags } = vi.hoisted(() => ({
  mockGetFeatureFlag: vi.fn(),
  mockGetAllFlags: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    getFeatureFlag: mockGetFeatureFlag,
    getAllFlags: mockGetAllFlags,
  })),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Server-side feature flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env var
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
  });

  it("getServerFeatureFlag returns boolean flag value", async () => {
    mockGetFeatureFlag.mockResolvedValue(true);

    // Re-import to pick up fresh env
    const { getServerFeatureFlag } = await import("../feature-flags");
    const result = await getServerFeatureFlag("test-flag", "user-123");

    expect(result).toBe(true);
    expect(mockGetFeatureFlag).toHaveBeenCalledWith("test-flag", "user-123", {
      groups: undefined,
    });
  });

  it("getServerFeatureFlag returns string variant", async () => {
    mockGetFeatureFlag.mockResolvedValue("variant-b");

    const { getServerFeatureFlag } = await import("../feature-flags");
    const result = await getServerFeatureFlag("checkout-flow", "user-456");

    expect(result).toBe("variant-b");
  });

  it("getServerFeatureFlag returns undefined on error", async () => {
    mockGetFeatureFlag.mockRejectedValue(new Error("Network error"));

    const { getServerFeatureFlag } = await import("../feature-flags");
    const result = await getServerFeatureFlag("test-flag", "user-789");

    expect(result).toBeUndefined();
  });

  it("getServerFeatureFlag passes groups for company-level flags", async () => {
    mockGetFeatureFlag.mockResolvedValue(true);

    const { getServerFeatureFlag } = await import("../feature-flags");
    await getServerFeatureFlag("enterprise-feature", "user-1", {
      company: "comp-123",
    });

    expect(mockGetFeatureFlag).toHaveBeenCalledWith(
      "enterprise-feature",
      "user-1",
      { groups: { company: "comp-123" } },
    );
  });

  it("isServerFeatureEnabled returns boolean", async () => {
    mockGetFeatureFlag.mockResolvedValue(true);

    const { isServerFeatureEnabled } = await import("../feature-flags");
    expect(await isServerFeatureEnabled("flag-a", "user-1")).toBe(true);

    mockGetFeatureFlag.mockResolvedValue(false);
    expect(await isServerFeatureEnabled("flag-b", "user-1")).toBe(false);
  });

  it("isServerFeatureEnabled returns false on null/undefined", async () => {
    mockGetFeatureFlag.mockResolvedValue(null);

    const { isServerFeatureEnabled } = await import("../feature-flags");
    expect(await isServerFeatureEnabled("unknown", "user-1")).toBe(false);
  });

  it("getAllServerFeatureFlags returns all flags", async () => {
    const flags = {
      "feature-a": true,
      "feature-b": "variant-x",
      "feature-c": false,
    };
    mockGetAllFlags.mockResolvedValue(flags);

    const { getAllServerFeatureFlags } = await import("../feature-flags");
    const result = await getAllServerFeatureFlags("user-1");

    expect(result).toEqual(flags);
  });

  it("getAllServerFeatureFlags returns empty on error", async () => {
    mockGetAllFlags.mockRejectedValue(new Error("timeout"));

    const { getAllServerFeatureFlags } = await import("../feature-flags");
    const result = await getAllServerFeatureFlags("user-1");

    expect(result).toEqual({});
  });
});

describe("Feature flag with missing API key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    // Reset module cache so the singleton re-evaluates
    vi.resetModules();
  });

  it("getServerFeatureFlag returns undefined when no key configured", async () => {
    const { getServerFeatureFlag } = await import("../feature-flags");
    const result = await getServerFeatureFlag("flag", "user-1");

    expect(result).toBeUndefined();
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
  });

  it("getAllServerFeatureFlags returns empty when no key configured", async () => {
    const { getAllServerFeatureFlags } = await import("../feature-flags");
    const result = await getAllServerFeatureFlags("user-1");

    expect(result).toEqual({});
    expect(mockGetAllFlags).not.toHaveBeenCalled();
  });
});
