import type { Collector, ParseResult, RawCapture, CollectorSource } from "./types";
import { httpFetch } from "./types";

// Non-global regex: exec() always starts at position 0.
// \d+\.\d+|\d+ avoids nested quantifiers (eliminates S8786 backtracking risk).
// [km] with /i flag covers K/M/k/m without duplicate chars (S5869).
const FOLLOWERS_RE = /(\d+\.\d+|\d+)([km])?\s*followers/i;

function getMultiplier(suffix: string | undefined): number {
  if (!suffix) return 1;
  const lower = suffix.toLowerCase();
  if (lower === "k") return 1_000;
  if (lower === "m") return 1_000_000;
  return 1;
}

function parseFollowers(html: string): number | null {
  const m = FOLLOWERS_RE.exec(html.replaceAll(",", ""));
  if (!m) return null;
  const base = Number(m[1]);
  const mult = getMultiplier(m[2]);
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
