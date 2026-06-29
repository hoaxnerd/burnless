import type { Collector, ParseResult, RawCapture, CollectorSource } from "./types";
import { httpFetch } from "./types";

function parseFollowers(html: string): number | null {
  const m = html.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)([KMkm])?\s*followers/i);
  if (!m) return null;
  const base = Number(m[1]);
  const mult = m[2]?.toLowerCase() === "k" ? 1_000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1;
  return Math.round(base * mult);
}

export const socialCollector: Collector = {
  type: "social",
  fetch: (source) => httpFetch(source.url),
  parse(raw: RawCapture, source: CollectorSource): ParseResult {
    const cfg = (source.config ?? {}) as { platform?: string; handle?: string };
    const followers = parseFollowers(raw.raw);
    return {
      structured: { platform: cfg.platform ?? null, handle: cfg.handle ?? null, followers, posts: null },
      confidence: followers != null ? 0.6 : 0.1,
    };
  },
};
