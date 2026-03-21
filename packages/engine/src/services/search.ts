/**
 * Search service abstraction — swappable between local (MeiliSearch)
 * and production (Algolia, Typesense, managed MeiliSearch, etc.).
 *
 * Local dev: MeiliSearch via Docker Compose
 * Production: set SEARCH_PROVIDER=algolia (or similar) + appropriate keys
 *
 * Usage:
 *   const search = createSearchService();
 *   await search.index("transactions", [{ id: "1", description: "AWS" }]);
 *   const results = await search.search("transactions", "AWS");
 */

// ── Interface ────────────────────────────────────────────────────────────────

export interface SearchDocument {
  id: string;
  [key: string]: unknown;
}

export interface SearchResult<T = SearchDocument> {
  hits: T[];
  totalHits: number;
  query: string;
  processingTimeMs: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  filter?: string;
  sort?: string[];
  attributesToRetrieve?: string[];
}

export interface SearchService {
  /** Index (upsert) documents into a named index. */
  index(indexName: string, documents: SearchDocument[]): Promise<void>;

  /** Search an index by query string. */
  search<T extends SearchDocument = SearchDocument>(
    indexName: string,
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<T>>;

  /** Delete documents by IDs from an index. */
  delete(indexName: string, documentIds: string[]): Promise<void>;

  /** Delete an entire index. */
  deleteIndex(indexName: string): Promise<void>;
}

// ── MeiliSearch provider (local dev) ─────────────────────────────────────────

export class MeiliSearchProvider implements SearchService {
  private baseUrl: string;
  private apiKey: string;

  constructor(
    baseUrl = process.env.MEILISEARCH_URL ?? "http://localhost:7700",
    apiKey = process.env.MEILISEARCH_API_KEY ?? "burnless-dev-key"
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => "");
      throw new Error(`MeiliSearch ${options.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
    }

    return res;
  }

  async index(indexName: string, documents: SearchDocument[]): Promise<void> {
    await this.request(`/indexes/${indexName}/documents`, {
      method: "POST",
      body: JSON.stringify(documents),
    });
  }

  async search<T extends SearchDocument = SearchDocument>(
    indexName: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult<T>> {
    const res = await this.request(`/indexes/${indexName}/search`, {
      method: "POST",
      body: JSON.stringify({
        q: query,
        limit: options.limit ?? 20,
        offset: options.offset ?? 0,
        filter: options.filter,
        sort: options.sort,
        attributesToRetrieve: options.attributesToRetrieve,
      }),
    });

    const data = await res.json();
    return {
      hits: data.hits ?? [],
      totalHits: data.estimatedTotalHits ?? data.totalHits ?? 0,
      query,
      processingTimeMs: data.processingTimeMs ?? 0,
    };
  }

  async delete(indexName: string, documentIds: string[]): Promise<void> {
    await this.request(`/indexes/${indexName}/documents/delete-batch`, {
      method: "POST",
      body: JSON.stringify(documentIds),
    });
  }

  async deleteIndex(indexName: string): Promise<void> {
    await this.request(`/indexes/${indexName}`, { method: "DELETE" });
  }
}

// ── No-op provider (when search is unavailable) ──────────────────────────────

export class NoopSearchProvider implements SearchService {
  async index(): Promise<void> {}
  async search<T extends SearchDocument = SearchDocument>(
    _indexName: string,
    query: string
  ): Promise<SearchResult<T>> {
    return { hits: [], totalHits: 0, query, processingTimeMs: 0 };
  }
  async delete(): Promise<void> {}
  async deleteIndex(): Promise<void> {}
}

// ── Factory ──────────────────────────────────────────────────────────────────

let _searchService: SearchService | null = null;

export function createSearchService(): SearchService {
  if (_searchService) return _searchService;

  const provider = process.env.SEARCH_PROVIDER ?? "meilisearch";

  switch (provider) {
    case "meilisearch":
      _searchService = new MeiliSearchProvider();
      break;
    // Future: case "algolia": _searchService = new AlgoliaProvider(); break;
    // Future: case "typesense": _searchService = new TypesenseProvider(); break;
    default:
      console.warn(`[search] Unknown provider "${provider}", using no-op.`);
      _searchService = new NoopSearchProvider();
  }

  return _searchService;
}

/** Reset the singleton — useful for testing. */
export function resetSearchService(): void {
  _searchService = null;
}
