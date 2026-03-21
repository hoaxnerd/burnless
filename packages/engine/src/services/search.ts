/**
 * Search service abstraction — semantic search via embeddings + pgvector.
 *
 * Uses PostgreSQL's pgvector extension for vector similarity search, which
 * eliminates the need for a separate search service (MeiliSearch, Algolia, etc.).
 * Embeddings are generated via the configured AI provider (Ollama locally,
 * OpenAI/Anthropic in production).
 *
 * For text search, falls back to PostgreSQL full-text search (tsvector).
 *
 * Usage:
 *   const search = createSearchService();
 *   await search.index("transactions", [{ id: "1", description: "AWS bill" }]);
 *   const results = await search.search("transactions", "cloud costs");
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
  /** Use semantic (vector) search. Default: true if embeddings available. */
  semantic?: boolean;
}

export interface SearchService {
  /** Index (upsert) documents into a named index. */
  index(indexName: string, documents: SearchDocument[]): Promise<void>;

  /** Search an index by query string (semantic or full-text). */
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

// ── No-op provider (default until pgvector tables are set up) ────────────────

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

/**
 * Create the search service.
 *
 * Currently returns a no-op until pgvector schema + embedding pipeline
 * is wired up in @burnless/db. The interface is stable — swap in the
 * real implementation without changing any consumer code.
 */
export function createSearchService(): SearchService {
  if (_searchService) return _searchService;
  _searchService = new NoopSearchProvider();
  return _searchService;
}

/** Reset the singleton — useful for testing. */
export function resetSearchService(): void {
  _searchService = null;
}
