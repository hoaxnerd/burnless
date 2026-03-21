/**
 * Embedding service — generates vector embeddings for semantic search via pgvector.
 *
 * Local dev: Ollama with nomic-embed-text (768 dimensions, runs locally)
 * Production: OpenAI text-embedding-3-small (1536 dims) or similar
 *
 * Usage:
 *   const embedder = createEmbeddingService();
 *   const vector = await embedder.embed("AWS cloud infrastructure costs");
 *   const vectors = await embedder.embedBatch(["text1", "text2"]);
 */

// ── Interface ────────────────────────────────────────────────────────────────

export interface EmbeddingService {
  /** Generate an embedding vector for a single text. */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts in one call. */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** The dimensionality of vectors produced by this model. */
  readonly dimensions: number;

  /** The model identifier. */
  readonly model: string;
}

// ── OpenAI-compatible provider (works with OpenAI, Ollama, OpenRouter) ───────

export class OpenAIEmbeddingProvider implements EmbeddingService {
  private baseUrl: string;
  private apiKey: string;
  readonly model: string;
  readonly dimensions: number;

  constructor(config: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    dimensions?: number;
  } = {}) {
    this.baseUrl = (config.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1").replace(/\/$/, "");
    this.apiKey = config.apiKey ?? process.env.EMBEDDING_API_KEY ?? process.env.AI_API_KEY ?? "ollama";
    this.model = config.model ?? process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
    this.dimensions = config.dimensions ?? parseInt(process.env.EMBEDDING_DIMENSIONS ?? "768", 10);
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Embedding API error: ${res.status} ${body}`);
    }

    const data = await res.json();
    const embeddings: number[][] = (data.data ?? [])
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);

    return embeddings;
  }
}

// ── No-op provider ───────────────────────────────────────────────────────────

export class NoopEmbeddingProvider implements EmbeddingService {
  readonly dimensions = 0;
  readonly model = "noop";

  async embed(): Promise<number[]> {
    return [];
  }
  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

let _embeddingService: EmbeddingService | null = null;

export function createEmbeddingService(): EmbeddingService {
  if (_embeddingService) return _embeddingService;

  const provider = process.env.EMBEDDING_PROVIDER ?? process.env.AI_PROVIDER;

  // Skip if explicitly disabled
  if (provider === "none" || provider === "disabled") {
    _embeddingService = new NoopEmbeddingProvider();
    return _embeddingService;
  }

  // For Ollama, OpenAI, OpenRouter — all use the OpenAI-compatible /v1/embeddings endpoint
  if (provider === "ollama" || provider === "openai" || provider === "openrouter" || process.env.OLLAMA_BASE_URL) {
    const configs: Record<string, { baseUrl?: string; apiKey?: string; model: string; dimensions: number }> = {
      ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
        apiKey: "ollama",
        model: process.env.EMBEDDING_MODEL ?? "nomic-embed-text",
        dimensions: 768,
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY,
        model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
        dimensions: 1536,
      },
      openrouter: {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY ?? process.env.AI_API_KEY,
        model: process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
        dimensions: 1536,
      },
    };

    const resolvedProvider = provider ?? "ollama";
    const config = configs[resolvedProvider] ?? configs.ollama;
    _embeddingService = new OpenAIEmbeddingProvider(config);
    return _embeddingService;
  }

  // No embedding provider configured
  _embeddingService = new NoopEmbeddingProvider();
  return _embeddingService;
}

/** Reset the singleton — useful for testing. */
export function resetEmbeddingService(): void {
  _embeddingService = null;
}
