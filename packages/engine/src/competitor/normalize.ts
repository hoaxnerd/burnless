// packages/engine/src/competitor/normalize.ts

/** Block-level closing tags whose boundary becomes a newline in visible text. */
const BLOCK_CLOSE =
  /<\/(p|div|li|ul|ol|section|article|header|footer|nav|main|aside|table|tr|thead|tbody|h[1-6]|blockquote|pre|figure|figcaption|form|dd|dt)\s*>/gi;
const BR = /<br\s*\/?>/gi;

function decodeEntities(s: string): string {
  // Decode &amp; LAST so we never double-decode (e.g. "&amp;lt;" must stay "&lt;").
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/**
 * HTML → stable visible text (one line per visible block). Deterministic and
 * pure. Same visible content with different nonces / attributes / whitespace /
 * comments / inline scripts normalizes to identical output — this is what lets
 * the pipeline's store-on-change ignore raw-HTML churn (spec §3.1).
 */
export function normalizeHtml(raw: string): string {
  let s = raw;
  // 1. Remove elements whose contents are never visible text.
  s = s.replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // 2. Remove HTML comments.
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // 3. Block boundaries → newline (preserve line structure for the line-diff).
  s = s.replace(BR, "\n").replace(BLOCK_CLOSE, "\n");
  // 4. Strip every remaining tag (removes all attributes → nonce/CSRF/data-* gone).
  s = s.replace(/<[^>]+>/g, " ");
  // 5. Decode common entities.
  s = decodeEntities(s);
  // 6. Per line: collapse intra-line whitespace, trim, drop empties.
  return s
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
