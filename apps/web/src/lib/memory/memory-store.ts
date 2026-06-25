import {
  insertMemory,
  listMemory,
  searchMemoryByEmbedding,
  type MemoryRow,
  type InsertMemoryInput,
} from "@burnless/db";
import { createEmbeddingService, type EmbeddingService } from "@burnless/ai";
import type { SearchMemoryOpts } from "@burnless/db";

export { type SearchMemoryOpts };

export const MEMORY_EMBEDDING_DIM = 1536;

export interface MemoryStoreDeps {
  /** Injectable embedder — defaults to `createEmbeddingService()`. */
  embedder?: EmbeddingService;
}

export class MemoryStore {
  private embedder: EmbeddingService;

  constructor(deps: MemoryStoreDeps = {}) {
    this.embedder = deps.embedder ?? createEmbeddingService();
  }

  /** True when a 1536-dim embedder is available (search/embedding possible). */
  get searchable(): boolean {
    return this.embedder.dimensions === MEMORY_EMBEDDING_DIM;
  }

  /**
   * Attempt to embed `text` with the current embedder.
   * Returns `null` (never throws) when: embedder is not 1536-dim, embed() throws,
   * or the returned vector has the wrong length.
   */
  private async tryEmbed(text: string): Promise<number[] | null> {
    if (!this.searchable) return null;
    try {
      const v = await this.embedder.embed(text);
      // Defensive: never store a vector with the wrong dimension in the column.
      return v.length === MEMORY_EMBEDDING_DIM ? v : null;
    } catch {
      return null; // graceful degradation — embedding failure must not surface
    }
  }

  /**
   * Insert a memory row; embeds `content` when the embedder is 1536-dim,
   * else stores `embedding: null` (row is still written — graceful degradation).
   */
  async write(entry: Omit<InsertMemoryInput, "embedding">): Promise<MemoryRow> {
    const embedding = await this.tryEmbed(entry.content);
    return insertMemory({ ...entry, embedding });
  }

  /**
   * Embed `query` and cosine-search recall-tier rows for the company.
   * Returns `[]` when search is unavailable (non-1536 embedder, embed throws, etc.).
   */
  async search(
    companyId: string,
    query: string,
    opts: SearchMemoryOpts = {},
  ): Promise<Array<MemoryRow & { distance: number }>> {
    if (!this.searchable) return [];
    const v = await this.tryEmbed(query);
    if (!v) return [];
    return searchMemoryByEmbedding(companyId, v, opts);
  }

  /**
   * Block-tier rows (always-injected/pinned) for the company + optional scope.
   */
  async block(
    companyId: string,
    opts: { domain?: string; kind?: string } = {},
  ): Promise<MemoryRow[]> {
    return listMemory({ companyId, tier: "block", domain: opts.domain, kind: opts.kind });
  }
}
