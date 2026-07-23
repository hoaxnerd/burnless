import type { Collector, RawCapture, CollectorSource } from "./types";
import { httpFetch } from "./types";

const ITEM_BLOCK = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
const MAX_ITEMS = 50;

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function stripTags(s: string): string {
  // Fixpoint strip (CodeQL js/incomplete-multi-character-sanitization remediation):
  // repeat until stable so nested / reconstructed tags (e.g. `<scr<script>ipt>`)
  // fully collapse; the optional `>?` also removes an unterminated trailing tag
  // like `<script` at end-of-input. Guarantees no `<…` survives.
  let out = s;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/<[^>]*>?/g, "");
  }
  return out;
}

function decode(s: string): string {
  // Decode entities first (so `&lt;script&gt;` becomes markup), then fixpoint-strip
  // tags — the loop guarantees no `<…` survives in the output. `&amp;` is decoded
  // last among the entities to avoid double-unescaping. The result is plain display
  // text (React escapes it again on render); this is defence-in-depth, not the sink.
  const decoded = stripCdata(s)
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
  return stripTags(decoded).trim();
}
function firstTag(block: string, name: string): string | null {
  const m = new RegExp(String.raw`<${name}\b[^>]*>([\s\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1]!) || null : null;
}
function atomHref(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]!);
  const pick =
    links.find((a) => /rel=["']?alternate/i.test(a)) ??
    links.find((a) => !/rel=/i.test(a)) ??
    links[0];
  if (!pick) return null;
  const href = /href=["']([^"']+)["']/i.exec(pick);
  return href ? decode(href[1]!) : null;
}
function toIso(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export const feedCollector: Collector = {
  type: "feed",
  fetch: (source: CollectorSource): Promise<RawCapture> => httpFetch(source.url),
  parse: (raw: RawCapture) => {
    const items: Record<string, { title: string; link: string; publishedAt: string | null }> = {};
    for (const block of raw.raw.match(ITEM_BLOCK) ?? []) {
      if (Object.keys(items).length >= MAX_ITEMS) break;
      const isAtom = /^<entry\b/i.test(block);
      const title = firstTag(block, "title");
      const link = isAtom ? atomHref(block) : firstTag(block, "link");
      const id = firstTag(block, "guid") ?? firstTag(block, "id") ?? link;
      if (!title || !id) continue;
      const publishedAt = toIso(
        firstTag(block, "pubDate") ?? firstTag(block, "updated") ?? firstTag(block, "published"),
      );
      items[id] = { title, link: link ?? "", publishedAt };
    }
    const n = Object.keys(items).length;
    return { structured: { items }, confidence: n > 0 ? 0.9 : 0.1 };
  },
};
