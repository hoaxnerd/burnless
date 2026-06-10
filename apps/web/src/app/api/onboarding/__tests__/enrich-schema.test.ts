/**
 * ONB-03 — enrichSchema validates the website URL BEFORE the paid AI enrich
 * call. Garbage ('asdf') must be rejected; a bare domain ('stripe.com') must
 * be accepted and have https:// prepended.
 *
 * The schema lives in its own module (../enrich/schema) — Next.js route
 * modules may only export route fields, so route.ts can't re-export it.
 */
import { describe, it, expect } from "vitest";

import { enrichSchema } from "../enrich/schema";

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
