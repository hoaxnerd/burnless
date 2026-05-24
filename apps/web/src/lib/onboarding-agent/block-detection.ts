/**
 * Heuristic detector for "this page is bot-blocked" pages and error strings.
 *
 * Used to decide whether the crawl result is worth feeding back to the model
 * or should be substituted with a hint telling the model to fall back to web
 * search. The list is intentionally generous — a false positive here only
 * costs one extra search; a false negative wastes an entire crawl budget slot
 * on a CAPTCHA page.
 */

const BLOCKED_MARKERS = [
  "cloudflare",
  "forbidden",
  "access denied",
  "security checkpoint",
  "ddos protection",
  "checking your browser",
  "captcha",
  "anti-bot",
  "robot",
  "blocked",
];

export function isBlocked(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_MARKERS.some((marker) => lower.includes(marker));
}
