/**
 * Web crawl service abstraction — swappable between local (Crawl4AI)
 * and production (Firecrawl, ScrapingBee, Apify, etc.).
 *
 * Local dev: Crawl4AI via Docker Compose (http://localhost:11235)
 * Production: set CRAWL_PROVIDER=firecrawl + FIRECRAWL_API_KEY
 *
 * Usage:
 *   const crawler = createCrawlService();
 *   const result = await crawler.crawl("https://example.com");
 *   console.log(result.markdown); // clean text content
 */

import { DirectFetchProvider } from "./direct-fetch";

// ── Interface ────────────────────────────────────────────────────────────────

export interface CrawlResult {
  url: string;
  markdown: string;
  html?: string;
  title?: string;
  statusCode: number;
  success: boolean;
  error?: string;
}

export interface CrawlOptions {
  /** Wait for JS rendering (default: true for Crawl4AI) */
  waitForJs?: boolean;
  /** Timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** CSS selector to extract (default: full page) */
  selector?: string;
  /** Extract only visible text (default: true) */
  onlyMainContent?: boolean;
}

export interface CrawlService {
  /** Crawl a single URL and return structured content. */
  crawl(url: string, options?: CrawlOptions): Promise<CrawlResult>;

  /** Crawl multiple URLs in parallel. */
  crawlMany(urls: string[], options?: CrawlOptions): Promise<CrawlResult[]>;
}

// ── Crawl4AI provider (local dev) ────────────────────────────────────────────

export class Crawl4AIProvider implements CrawlService {
  private baseUrl: string;
  private apiToken: string;

  constructor(
    baseUrl = process.env.CRAWL4AI_URL ?? "http://localhost:11235",
    apiToken = process.env.CRAWL4AI_API_TOKEN ?? "burnless-dev-token"
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiToken = apiToken;
  }

  async crawl(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    try {
      const res = await fetch(`${this.baseUrl}/crawl`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
        },
        body: JSON.stringify({
          urls: [url],
          word_count_threshold: 10,
          extraction_config: {
            type: "basic",
            params: {
              ...(options.selector ? { css_selector: options.selector } : {}),
            },
          },
          crawler_params: {
            headless: true,
            page_timeout: options.timeoutMs ?? 30000,
          },
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 60000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          url,
          markdown: "",
          statusCode: res.status,
          success: false,
          error: `Crawl4AI error: ${res.status} ${body}`,
        };
      }

      const data = await res.json();
      // Crawl4AI returns results array
      const result = data.results?.[0] ?? data;

      return {
        url,
        markdown: result.markdown ?? result.extracted_content ?? "",
        html: result.html,
        title: result.metadata?.title,
        statusCode: result.status_code ?? 200,
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
    }
  }

  async crawlMany(urls: string[], options: CrawlOptions = {}): Promise<CrawlResult[]> {
    // Crawl4AI supports batch — but for reliability, run concurrently with limit
    const concurrency = 5;
    const results: CrawlResult[] = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((url) => this.crawl(url, options))
      );
      results.push(...batchResults);
    }

    return results;
  }
}

// ── No-op provider (when crawling is unavailable) ────────────────────────────

export class NoopCrawlProvider implements CrawlService {
  async crawl(url: string): Promise<CrawlResult> {
    return {
      url,
      markdown: "",
      statusCode: 0,
      success: false,
      error: "Crawl service not configured",
    };
  }
  async crawlMany(urls: string[]): Promise<CrawlResult[]> {
    return urls.map((url) => ({
      url,
      markdown: "",
      statusCode: 0,
      success: false,
      error: "Crawl service not configured",
    }));
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

let _crawlService: CrawlService | null = null;

export function createCrawlService(): CrawlService {
  if (_crawlService) return _crawlService;

  const provider = process.env.CRAWL_PROVIDER ?? "direct-fetch";

  switch (provider) {
    case "direct-fetch":
      _crawlService = new DirectFetchProvider();
      break;
    case "crawl4ai":
      _crawlService = new Crawl4AIProvider();
      break;
    // Future: case "firecrawl": _crawlService = new FirecrawlProvider(); break;
    // Future: case "scrapingbee": _crawlService = new ScrapingBeeProvider(); break;
    default:
      _crawlService = new NoopCrawlProvider();
  }

  return _crawlService;
}

/** Reset the singleton — useful for testing. */
export function resetCrawlService(): void {
  _crawlService = null;
}
