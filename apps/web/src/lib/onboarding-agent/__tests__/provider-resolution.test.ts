import { describe, it, expect, vi, beforeEach } from "vitest";

const { getCompanyProviderConfig, createProvider, getProviderForFeature } = vi.hoisted(() => ({
  getCompanyProviderConfig: vi.fn(),
  createProvider: vi.fn(),
  getProviderForFeature: vi.fn(),
}));

vi.mock("@/lib/ai-feature-flags", () => ({ getCompanyProviderConfig }));
vi.mock("@burnless/ai", async (orig) => {
  const actual = await orig<typeof import("@burnless/ai")>();
  return { ...actual, createProvider, getProviderForFeature, getFinancialTools: () => [] };
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
  createProvider.mockReturnValue(fakeProvider);
  getProviderForFeature.mockReturnValue(null); // env empty (BYO self-host)
});

describe("runOnboardingAgent provider resolution", () => {
  it("uses the company DB provider when companyId is given", async () => {
    getCompanyProviderConfig.mockResolvedValue({
      provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini", baseUrl: undefined,
    });

    const result = await runOnboardingAgent("https://acme.com", "user-1", () => {}, "co-1");

    expect(getCompanyProviderConfig).toHaveBeenCalledWith("co-1");
    expect(createProvider).toHaveBeenCalledWith({
      provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini", baseUrl: undefined,
    });
    expect(getProviderForFeature).not.toHaveBeenCalled();
    expect((result as { companyName: string }).companyName).toBe("Acme");
  });

  it("throws when no DB provider and no env provider", async () => {
    getCompanyProviderConfig.mockResolvedValue(undefined);
    await expect(
      runOnboardingAgent("https://acme.com", "user-1", () => {}, "co-1"),
    ).rejects.toThrow("No AI provider configured for onboarding enrichment.");
  });
});
