import { httpFetch } from "./collectors/types";

type Candidate = { type: "feed" | "sitemap"; url: string };

/** Resolve a candidate URL (possibly relative) against the site base, deduplicate, and add to out. */
function resolveCandidate(
  type: Candidate["type"],
  url: string,
  base: string,
  out: Candidate[],
  seen: Set<string>,
): void {
  let abs: string;
  try {
    abs = new URL(url, base).toString();
  } catch {
    return;
  }
  const key = `${type}:${abs}`;
  if (!seen.has(key)) {
    seen.add(key);
    out.push({ type, url: abs });
  }
}

/** Probe the homepage for <link rel="alternate"> feed declarations. */
async function probeHomeFeeds(
  siteUrl: string,
  out: Candidate[],
  seen: Set<string>,
): Promise<void> {
  try {
    const home = await httpFetch(siteUrl);
    for (const m of home.raw.matchAll(/<link\b([^>]*)>/gi)) {
      const attrs = m[1]!;
      if (
        /rel=["']?alternate/i.test(attrs) &&
        /type=["']application\/(rss|atom)\+xml["']/i.test(attrs)
      ) {
        const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
        if (href) resolveCandidate("feed", href, siteUrl, out, seen);
      }
    }
  } catch {
    /* ignore */
  }
}

/** Probe robots.txt for Sitemap: lines; returns true when at least one was found. */
async function probeRobotsSitemap(
  siteUrl: string,
  out: Candidate[],
  seen: Set<string>,
): Promise<boolean> {
  let found = false;
  try {
    const robots = await httpFetch(new URL("/robots.txt", siteUrl).toString());
    for (const line of robots.raw.split(/\r?\n/)) {
      const m = /^\s*sitemap:\s*(\S+)/i.exec(line);
      if (m) {
        resolveCandidate("sitemap", m[1]!, siteUrl, out, seen);
        found = true;
      }
    }
  } catch {
    /* ignore */
  }
  return found;
}

/** Fallback probe: fetch /sitemap.xml directly and accept if it looks valid. */
async function probeFallbackSitemap(
  siteUrl: string,
  out: Candidate[],
  seen: Set<string>,
): Promise<void> {
  try {
    const url = new URL("/sitemap.xml", siteUrl).toString();
    const res = await httpFetch(url);
    if (res.status === 200 && /<(urlset|sitemapindex)[\s>]/i.test(res.raw)) {
      resolveCandidate("sitemap", url, siteUrl, out, seen);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Deterministically discover a competitor's RSS/Atom feed(s) + sitemap from
 * their site URL. No AI. Best-effort: every fetch is guarded so a failure skips
 * that source rather than throwing. Returns absolute, de-duped candidates.
 */
export async function discoverFeeds(siteUrl: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  await probeHomeFeeds(siteUrl, out, seen);
  const hadRobotsSitemap = await probeRobotsSitemap(siteUrl, out, seen);
  if (!hadRobotsSitemap) await probeFallbackSitemap(siteUrl, out, seen);
  return out;
}
