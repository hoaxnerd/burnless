/**
 * ONB-03 — enrichSchema validates the website URL BEFORE the paid AI enrich
 * call. Garbage ('asdf') must be rejected; a bare domain ('stripe.com') must
 * be accepted and have https:// prepended.
 *
 * Heavy server deps are mocked so importing the route module is side-effect
 * free — we only exercise the exported schema.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: vi.fn(),
  getUserCompany: vi.fn(),
  errorResponse: vi.fn(),
  withErrorHandler: (fn: unknown) => fn,
}));
vi.mock("@/lib/api-rate-limit", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/ai-feature-flags", () => ({ checkAiFeatureAllowed: vi.fn() }));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: vi.fn() }));
vi.mock("@/lib/onboarding-agent", () => ({ runOnboardingAgent: vi.fn() }));

import { enrichSchema } from "../enrich/route";

describe("ONB-03 enrichSchema", () => {
  it("rejects garbage with no dot ('asdf')", () => {
    expect(() => enrichSchema.parse({ websiteUrl: "asdf" })).toThrow();
  });

  it("rejects a host with no TLD-like segment", () => {
    expect(() => enrichSchema.parse({ websiteUrl: "localhost" })).toThrow();
    expect(() => enrichSchema.parse({ websiteUrl: "stripe." })).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => enrichSchema.parse({ websiteUrl: "" })).toThrow();
  });

  it("accepts a bare domain and prepends https://", () => {
    const result = enrichSchema.parse({ websiteUrl: "stripe.com" });
    expect(result.websiteUrl).toBe("https://stripe.com");
  });

  it("accepts a domain with subdomain and path", () => {
    const result = enrichSchema.parse({ websiteUrl: "www.stripe.com/about" });
    expect(result.websiteUrl).toBe("https://www.stripe.com/about");
  });

  it("preserves an explicit scheme", () => {
    const result = enrichSchema.parse({ websiteUrl: "http://stripe.com" });
    expect(result.websiteUrl).toBe("http://stripe.com");
  });

  it("trims surrounding whitespace before validating", () => {
    const result = enrichSchema.parse({ websiteUrl: "  stripe.com  " });
    expect(result.websiteUrl).toBe("https://stripe.com");
  });
});
