import { describe, it, expect, vi, beforeEach } from "vitest";

const { getCompanyProviderConfig, resolveResilientProvider } = vi.hoisted(() => ({
  getCompanyProviderConfig: vi.fn(),
  resolveResilientProvider: vi.fn(),
}));

vi.mock("@/lib/ai-feature-flags", () => ({ getCompanyProviderConfig }));
vi.mock("@burnless/ai", async (orig) => {
  const actual = await orig<typeof import("@burnless/ai")>();
  return { ...actual, resolveResilientProvider, getFinancialTools: () => [] };
});
vi.mock("../heal", () => ({ healOnboardingResult: (x: unknown) => x }));
vi.mock("@/lib/ai-tools", () => ({ executeToolCall: vi.fn() }));

import { runOnboardingAgent } from "../index";

const fakeProvider = {
  complete: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: '```json\n{"companyName":"Acme"}\n```' }],
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveResilientProvider.mockReturnValue(fakeProvider);
});

describe("runOnboardingAgent provider resolution", () => {
  it("routes the company DB provider through THE seam when companyId is given", async () => {
    getCompanyProviderConfig.mockResolvedValue({
      provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini", baseUrl: undefined,
    });

    const result = await runOnboardingAgent("https://acme.com", "user-1", () => {}, "co-1");

    expect(getCompanyProviderConfig).toHaveBeenCalledWith("co-1");
    // The seam receives the mapped company config; how it's sourced is invisible to it.
    expect(resolveResilientProvider).toHaveBeenCalledWith("onboarding_enrich", {
      provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini", baseUrl: undefined,
    });
    expect((result as { companyName: string }).companyName).toBe("Acme");
  });

  it("lets the seam env-fallback when no usable DB config (passes undefined config)", async () => {
    getCompanyProviderConfig.mockResolvedValue(undefined);
    fakeProvider.complete.mockResolvedValueOnce({
      content: [{ type: "text", text: '```json\n{"companyName":"Acme"}\n```' }],
    });

    await runOnboardingAgent("https://acme.com", "user-1", () => {}, "co-1");

    // No usable config → seam is asked to resolve from env/tier routing.
    expect(resolveResilientProvider).toHaveBeenCalledWith("onboarding_enrich", undefined);
  });

  it("throws when the seam yields no provider", async () => {
    getCompanyProviderConfig.mockResolvedValue(undefined);
    resolveResilientProvider.mockReturnValue(null);
    await expect(
      runOnboardingAgent("https://acme.com", "user-1", () => {}, "co-1"),
    ).rejects.toThrow("No AI provider configured for onboarding enrichment.");
  });
});
