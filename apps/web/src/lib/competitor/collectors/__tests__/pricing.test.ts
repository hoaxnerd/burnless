import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pricingCollector } from "../pricing";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");
const cap = (raw: string) => ({ contentType: "text/html", raw, fetchedAt: new Date(0), status: 200 });
const src = { id: "s1", type: "pricing", url: "https://x/pricing" };

describe("pricingCollector.parse", () => {
  it("extracts plans from JSON-LD with high confidence", () => {
    const r = pricingCollector.parse(cap(fx("pricing-jsonld.html")), src);
    const plans = (r.structured as any).plans;
    expect(plans[0].name).toBe("Pro");
    expect(plans[0].price.amount).toBe(29);
    expect(plans[0].price.currency).toBe("USD");
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("falls back to DOM heuristics with moderate confidence", () => {
    const r = pricingCollector.parse(cap(fx("pricing-dom.html")), src);
    expect((r.structured as any).plans.length).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0.3);
  });

  it("returns low confidence when nothing parses", () => {
    const r = pricingCollector.parse(cap(fx("pricing-broken.html")), src);
    expect(r.confidence).toBeLessThan(0.4);
  });

  it("returns low confidence for JSON-LD Product without an offer price (no real tiers)", () => {
    const r = pricingCollector.parse(cap(fx("pricing-jsonld-noprice.html")), src);
    expect(r.confidence).toBeLessThan(0.4);
  });

  it("returns low confidence for noisy DOM with many unnamed/implausible plan blocks", () => {
    const r = pricingCollector.parse(cap(fx("pricing-dom-noise.html")), src);
    expect(r.confidence).toBeLessThan(0.4);
  });

  it("still parses a clean 2-tier DOM pricing page with moderate confidence", () => {
    const r = pricingCollector.parse(cap(fx("pricing-dom.html")), src);
    expect((r.structured as any).plans.length).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0.3);
  });
});
