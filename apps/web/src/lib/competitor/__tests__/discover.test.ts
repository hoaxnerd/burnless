import { describe, it, expect, vi, afterEach } from "vitest";
import { discoverFeeds } from "../discover";

function stubFetch(map: Record<string, { body: string; status?: number }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const hit = map[url.toString()];
    if (!hit) return { ok: false, status: 404, text: async () => "", headers: { get: () => null } } as never;
    return { ok: true, status: hit.status ?? 200, text: async () => hit.body, headers: { get: () => "text/html" } } as never;
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe("discoverFeeds", () => {
  it("finds a <link rel=alternate> feed and a robots.txt sitemap", async () => {
    stubFetch({
      "https://acme.com/": { body: `<link rel="alternate" type="application/rss+xml" href="/blog/rss">` },
      "https://acme.com/robots.txt": { body: "User-agent: *\nSitemap: https://acme.com/sitemap.xml" },
    });
    const out = await discoverFeeds("https://acme.com/");
    expect(out).toContainEqual({ type: "feed", url: "https://acme.com/blog/rss" });
    expect(out).toContainEqual({ type: "sitemap", url: "https://acme.com/sitemap.xml" });
  });

  it("falls back to /sitemap.xml when robots has none, and never throws on fetch failure", async () => {
    stubFetch({
      "https://acme.com/": { body: "<html>no feed</html>" },
      // robots.txt missing → 404; fallback probe:
      "https://acme.com/sitemap.xml": { body: `<urlset><url><loc>https://acme.com/</loc></url></urlset>` },
    });
    const out = await discoverFeeds("https://acme.com/");
    expect(out).toEqual([{ type: "sitemap", url: "https://acme.com/sitemap.xml" }]);
  });
});
