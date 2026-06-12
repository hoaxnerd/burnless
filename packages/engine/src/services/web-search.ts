/**
 * Web search service abstraction — gives the Companion web search capability.
 *
 * Local dev: SearXNG (self-hosted meta search engine) via Docker Compose
 * Production: Tavily API (purpose-built for LLM web search), or Serper/Brave
 *
 * This is what the LLM uses as a tool when it needs to look up real-time
 * information (market data, competitor info, regulatory updates, etc.).
 *
 * Usage:
 *   const webSearch = createWebSearchService();
 *   const results = await webSearch.search("SaaS benchmark metrics 2026");
 */

import { DuckDuckGoProvider } from "./duckduckgo";

// ── Interface ────────────────────────────────────────────────────────────────

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
  totalResults: number;
  processingTimeMs: number;
}

export interface WebSearchOptions {
  /** Max results to return (default: 5) */
  maxResults?: number;
  /** Restrict to specific domains */
  domains?: string[];
  /** Time range: "day", "week", "month", "year" */
  timeRange?: string;
}

export interface WebSearchService {
  /** Search the web and return structured results. */
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResponse>;
}

// ── SearXNG provider (local dev) ─────────────────────────────────────────────

export class SearXNGProvider implements WebSearchService {
  private baseUrl: string;

  constructor(
    baseUrl = process.env.SEARXNG_URL ?? "http://localhost:8888"
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResponse> {
    const start = Date.now();
    const maxResults = options.maxResults ?? 5;

    try {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        categories: "general",
      });

      if (options.timeRange) {
        params.set("time_range", options.timeRange);
      }

      const res = await fetch(`${this.baseUrl}/search?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`SearXNG error: ${res.status} ${body}`);
      }

      const data = await res.json();
      const results: WebSearchResult[] = (data.results ?? [])
        .slice(0, maxResults)
        .map((r: { title?: string; url?: string; content?: string; score?: number }) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content ?? "",
          score: r.score,
        }));

      // Filter by domains if specified
      const filtered = options.domains?.length
        ? results.filter((r) =>
            options.domains!.some((d) => r.url.includes(d))
          )
        : results;

      return {
        results: filtered,
        query,
        totalResults: data.number_of_results ?? filtered.length,
        processingTimeMs: Date.now() - start,
      };
    } catch (err) {
      return {
        results: [],
        query,
        totalResults: 0,
        processingTimeMs: Date.now() - start,
      };
    }
  }
}

// ── Tavily provider (production) ─────────────────────────────────────────────

export class TavilyProvider implements WebSearchService {
  private apiKey: string;

  constructor(apiKey = process.env.TAVILY_API_KEY ?? "") {
    this.apiKey = apiKey;
  }

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResponse> {
    const start = Date.now();

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: options.maxResults ?? 5,
          include_domains: options.domains,
          search_depth: "basic",
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        throw new Error(`Tavily error: ${res.status}`);
      }

      const data = await res.json();
      const results: WebSearchResult[] = (data.results ?? []).map(
        (r: { title?: string; url?: string; content?: string; score?: number }) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content ?? "",
          score: r.score,
        })
      );

      return {
        results,
        query,
        totalResults: results.length,
        processingTimeMs: Date.now() - start,
      };
    } catch (err) {
      return {
        results: [],
        query,
        totalResults: 0,
        processingTimeMs: Date.now() - start,
      };
    }
  }
}

// ── No-op provider ───────────────────────────────────────────────────────────

export class NoopWebSearchProvider implements WebSearchService {
  async search(query: string): Promise<WebSearchResponse> {
    return {
      results: [],
      query,
      totalResults: 0,
      processingTimeMs: 0,
    };
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

let _webSearchService: WebSearchService | null = null;

export function createWebSearchService(): WebSearchService {
  if (_webSearchService) return _webSearchService;

  const provider = process.env.WEB_SEARCH_PROVIDER ?? "duckduckgo";

  switch (provider) {
    case "duckduckgo":
      _webSearchService = new DuckDuckGoProvider();
      break;
    case "searxng":
      _webSearchService = new SearXNGProvider();
      break;
    case "tavily":
      _webSearchService = new TavilyProvider();
      break;
    default:
      _webSearchService = new NoopWebSearchProvider();
  }

  return _webSearchService;
}

/** Reset the singleton — useful for testing. */
export function resetWebSearchService(): void {
  _webSearchService = null;
}
