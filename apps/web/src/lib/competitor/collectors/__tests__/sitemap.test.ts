import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sitemapCollector } from "../sitemap";

const raw = (body: string) => ({ contentType: "application/xml", raw: body, fetchedAt: new Date(), status: 200 });
const src = { id: "s1", type: "sitemap", url: "https://acme.com/sitemap.xml" };

describe("sitemapCollector.parse", () => {
  it("parses a urlset into url→lastmod map + count", () => {
    const body = readFileSync(join(__dirname, "fixtures", "sitemap.xml"), "utf8");
    const r = sitemapCollector.parse(raw(body), src);
    expect(r.confidence).toBe(0.9);
    const urls = r.structured.urls as Record<string, unknown>;
    expect(Object.keys(urls).sort()).toEqual(["https://acme.com/", "https://acme.com/pricing"]);
    expect(urls["https://acme.com/"]).toBe("2026-07-01");
    expect(urls["https://acme.com/pricing"]).toBe(1);
    expect(r.structured.count).toBe(2);
  });

  it("low confidence for a sitemap index (nested — out of scope)", () => {
    const idx = `<sitemapindex><sitemap><loc>https://acme.com/s1.xml</loc></sitemap></sitemapindex>`;
    expect(sitemapCollector.parse(raw(idx), src).confidence).toBe(0.1);
  });

  it("low confidence for an empty / non-sitemap document", () => {
    expect(sitemapCollector.parse(raw("<html></html>"), src).confidence).toBe(0.1);
  });
});
