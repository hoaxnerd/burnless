import { httpFetch } from "./collectors/types";

type Candidate = { type: "feed" | "sitemap"; url: string };

/**
 * Deterministically discover a competitor's RSS/Atom feed(s) + sitemap from
 * their site URL. No AI. Best-effort: every fetch is guarded so a failure skips
 * that source rather than throwing. Returns absolute, de-duped candidates.
 */
export async function discoverFeeds(siteUrl: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (type: Candidate["type"], url: string) => {
    let abs: string;
    try {
      abs = new URL(url, siteUrl).toString();
    } catch {
      return;
    }
    const key = `${type}:${abs}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ type, url: abs });
    }
  };

  // 1. Homepage <link rel="alternate" type="application/rss+xml|atom+xml">
  try {
    const home = await httpFetch(siteUrl);
    for (const m of home.raw.matchAll(/<link\b([^>]*)>/gi)) {
      const attrs = m[1]!;
      if (/rel=["']?alternate/i.test(attrs) && /type=["']application\/(rss|atom)\+xml["']/i.test(attrs)) {
        const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
        if (href) add("feed", href);
      }
    }
  } catch {
    /* ignore */
  }

  // 2. robots.txt Sitemap: lines
  let robotsHadSitemap = false;
  try {
    const robots = await httpFetch(new URL("/robots.txt", siteUrl).toString());
    for (const line of robots.raw.split(/\r?\n/)) {
      const m = /^\s*sitemap:\s*(\S+)/i.exec(line);
      if (m) {
        add("sitemap", m[1]!);
        robotsHadSitemap = true;
      }
    }
  } catch {
    /* ignore */
  }

  // 3. Fallback probe /sitemap.xml
  if (!robotsHadSitemap) {
    try {
      const url = new URL("/sitemap.xml", siteUrl).toString();
      const res = await httpFetch(url);
      if (res.status === 200 && /<(urlset|sitemapindex)[\s>]/i.test(res.raw)) add("sitemap", url);
    } catch {
      /* ignore */
    }
  }

  return out;
}
