/**
 * DuckDuckGo web-search provider — keyless, no Docker, graceful-degrade.
 *
 * Queries DuckDuckGo's no-JS HTML endpoint (`https://html.duckduckgo.com/html/`)
 * with a normal browser User-Agent and parses the result rows with a light
 * regex extractor (no HTML-parse dependency — keeps the OSS release lean).
 *
 * This is the DEFAULT web-search provider for the standalone/self-host edition:
 * it needs no API key and no companion container, unlike SearXNG/Tavily.
 *
 * On ANY network/parse failure it returns an empty `WebSearchResponse`
 * (mirroring `NoopWebSearchProvider`) so the Companion tool degrades silently.
 */

import type {
  WebSearchOptions,
  WebSearchResponse,
  WebSearchResult,
  WebSearchService,
} from "./web-search";

const DDG_HTML_ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Matches each `<a class="result__a" ...>title</a>` anchor.
const RESULT_ANCHOR_RE =
  /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
// Matches each `<a class="result__snippet" ...>snippet</a>` anchor.
const SNIPPET_ANCHOR_RE =
  /<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** Decode the common HTML entities + numeric refs, strip tags, collapse whitespace. */
function cleanText(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

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

/**
 * Resolve a DDG result href. DDG wraps targets in a redirect of the form
 * `//duckduckgo.com/l/?uddg=<url-encoded-target>&rut=...`; unwrap to the real
 * target. Plain (non-redirect) hrefs are returned with the scheme normalized.
 */
function resolveHref(href: string): string {
  const decoded = decodeEntities(href).trim();
  const uddgMatch = decoded.match(/[?&]uddg=([^&]+)/);
  if (uddgMatch?.[1]) {
    const target = uddgMatch[1];
    try {
      return decodeURIComponent(target);
    } catch {
      return target;
    }
  }
  if (decoded.startsWith("//")) return `https:${decoded}`;
  return decoded;
}

export class DuckDuckGoProvider implements WebSearchService {
  async search(
    query: string,
    options: WebSearchOptions = {}
  ): Promise<WebSearchResponse> {
    const start = Date.now();
    const maxResults = options.maxResults ?? 5;

    try {
      const params = new URLSearchParams({ q: query });
      // DDG accepts a coarse time filter via `df` (d/w/m/y).
      if (options.timeRange) {
        const dfMap: Record<string, string> = {
          day: "d",
          week: "w",
          month: "m",
          year: "y",
        };
        const df = dfMap[options.timeRange];
        if (df) params.set("df", df);
      }

      const res = await fetch(DDG_HTML_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
          Accept: "text/html",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        throw new Error(`DuckDuckGo error: ${res.status}`);
      }

      const html = await res.text();
      const results = this.parse(html);

      const filtered = options.domains?.length
        ? results.filter((r) =>
            options.domains!.some((d) => r.url.includes(d))
          )
        : results;

      const limited = filtered.slice(0, maxResults);

      return {
        results: limited,
        query,
        totalResults: limited.length,
        processingTimeMs: Date.now() - start,
      };
    } catch {
      return {
        results: [],
        query,
        totalResults: 0,
        processingTimeMs: Date.now() - start,
      };
    }
  }

  private parse(html: string): WebSearchResult[] {
    // Collect snippets in document order; pair them positionally with titles.
    const snippets: string[] = [];
    SNIPPET_ANCHOR_RE.lastIndex = 0;
    let sm: RegExpExecArray | null;
    while ((sm = SNIPPET_ANCHOR_RE.exec(html)) !== null) {
      snippets.push(cleanText(sm[1] ?? ""));
    }

    const results: WebSearchResult[] = [];
    RESULT_ANCHOR_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    let i = 0;
    while ((am = RESULT_ANCHOR_RE.exec(html)) !== null) {
      const url = resolveHref(am[1] ?? "");
      const title = cleanText(am[2] ?? "");
      if (!url || !title) {
        i++;
        continue;
      }
      results.push({
        title,
        url,
        snippet: snippets[i] ?? "",
      });
      i++;
    }

    return results;
  }
}
