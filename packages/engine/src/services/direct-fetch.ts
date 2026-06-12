/**
 * Direct-fetch crawl provider — no Docker, no headless browser, keyless.
 *
 * `crawl(url)` does a plain `fetch(url)` and converts the returned HTML into
 * readable text with a light, dependency-free extractor (drop <script>/<style>/
 * comments, strip tags, decode common entities, collapse whitespace). This keeps
 * the OSS release lean — no `turndown`/`node-html-markdown`/`cheerio` dependency.
 *
 * This is the DEFAULT crawl provider for the standalone/self-host edition.
 * `Crawl4AIProvider` is kept for opt-in via `CRAWL_PROVIDER=crawl4ai`.
 *
 * Graceful-degrade: any non-200 or thrown error yields
 * `{ url, markdown: "", statusCode, success: false, error }` — never throws.
 * Respects a byte cap (truncate huge bodies) and a timeout via AbortController.
 */

import type { CrawlOptions, CrawlResult, CrawlService } from "./crawl";

const DEFAULT_TIMEOUT_MS = 30_000;
/** Cap extracted text length to keep memory + token usage sane. */
const MAX_TEXT_BYTES = 1_000_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
      safeCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_m, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z0-9#]+);/gi, (m, name: string) => {
      const key = name.toLowerCase();
      return NAMED_ENTITIES[key] ?? m;
    });
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return undefined;
  const t = decodeEntities(m[1].replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return t || undefined;
}

/** Minimal HTML → readable text: drop non-content tags, strip markup, decode, collapse. */
function htmlToText(html: string): string {
  const text = html
    // Remove elements whose contents are not human-readable.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Turn block-level boundaries into newlines so text doesn't run together.
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip all remaining tags.
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class DirectFetchProvider implements CrawlService {
  async crawl(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!res.ok) {
        return {
          url,
          markdown: "",
          statusCode: res.status,
          success: false,
          error: `Direct fetch error: ${res.status}`,
        };
      }

      let html = await res.text();
      if (html.length > MAX_TEXT_BYTES) {
        html = html.slice(0, MAX_TEXT_BYTES);
      }

      let markdown = htmlToText(html);
      if (markdown.length > MAX_TEXT_BYTES) {
        markdown = markdown.slice(0, MAX_TEXT_BYTES);
      }

      return {
        url,
        markdown,
        title: extractTitle(html),
        statusCode: res.status,
        success: true,
      };
    } catch (err) {
      return {
        url,
        markdown: "",
        statusCode: 0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async crawlMany(
    urls: string[],
    options: CrawlOptions = {}
  ): Promise<CrawlResult[]> {
    return Promise.all(urls.map((url) => this.crawl(url, options)));
  }
}
