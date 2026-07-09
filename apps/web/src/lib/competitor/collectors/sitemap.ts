import type { Collector, RawCapture, CollectorSource } from "./types";
import { httpFetch } from "./types";

const URL_BLOCK = /<url\b[\s\S]*?<\/url>/gi;
const LOC = /<loc>\s*([\s\S]*?)\s*<\/loc>/i;
const LASTMOD = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i;
const MAX_URLS = 2000;

function decode(s: string): string {
  return s.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim();
}

export const sitemapCollector: Collector = {
  type: "sitemap",
  fetch: (source: CollectorSource): Promise<RawCapture> => httpFetch(source.url),
  parse: (raw: RawCapture) => {
    // Sitemap INDEX (list of child sitemaps) is not fetched-through in this MVP.
    if (/<sitemapindex[\s>]/i.test(raw.raw)) {
      return { structured: { urls: {}, count: 0 }, confidence: 0.1 };
    }
    const urls: Record<string, string | number> = {};
    let truncated = false;
    for (const block of raw.raw.match(URL_BLOCK) ?? []) {
      if (Object.keys(urls).length >= MAX_URLS) { truncated = true; break; }
      const loc = LOC.exec(block)?.[1];
      if (!loc) continue;
      const url = decode(loc);
      if (!url) continue;
      const lastmod = LASTMOD.exec(block)?.[1];
      urls[url] = lastmod ? decode(lastmod) : 1;
    }
    const count = Object.keys(urls).length;
    const structured = truncated ? { urls, count, truncated: true } : { urls, count };
    return { structured, confidence: count > 0 ? 0.9 : 0.1 };
  },
};
