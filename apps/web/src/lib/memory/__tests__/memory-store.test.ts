import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmbeddingService } from "@burnless/ai";
import type { MemoryRow } from "@burnless/db";

// ── Mock @burnless/db ─────────────────────────────────────────────────────────
vi.mock("@burnless/db", () => ({
  insertMemory: vi.fn(),
  listMemory: vi.fn(),
  searchMemoryByEmbedding: vi.fn(),
}));

// Import mocked fns AFTER vi.mock so they are the mock instances.
import { insertMemory, listMemory, searchMemoryByEmbedding } from "@burnless/db";
import { MemoryStore, MEMORY_EMBEDDING_DIM } from "../memory-store";

// ── Fake embedders ────────────────────────────────────────────────────────────

function make1536Embedder(embedImpl?: () => Promise<number[]>): EmbeddingService {
  return {
    dimensions: 1536,
    model: "fake-1536",
    embed: embedImpl ?? (() => Promise.resolve(Array(1536).fill(0.1))),
    embedBatch: (texts: string[]) =>
      Promise.resolve(texts.map(() => Array(1536).fill(0.1))),
  };
}

function make768Embedder(): EmbeddingService {
  return {
    dimensions: 768,
    model: "fake-768",
    embed: () => Promise.resolve(Array(768).fill(0.2)),
    embedBatch: (texts: string[]) =>
      Promise.resolve(texts.map(() => Array(768).fill(0.2))),
  };
}

/** A stub MemoryRow with just enough fields for test assertions. */
function stubRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: "row-1",
    companyId: "co-1",
    userId: null,
    domain: "test",
    kind: "fact",
    tier: "recall",
    label: null,
    content: "hello",
    embedding: null,
    metadata: null,
    readOnly: false,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemoryStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock return values
    (insertMemory as ReturnType<typeof vi.fn>).mockResolvedValue(stubRow());
    (listMemory as ReturnType<typeof vi.fn>).mockResolvedValue([stubRow()]);
    (searchMemoryByEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...stubRow(), distance: 0.05 },
    ]);
  });

  // 1. searchable flag
  it("searchable === true with a 1536-dim embedder; false with a 768-dim embedder", () => {
    const store1536 = new MemoryStore({ embedder: make1536Embedder() });
    expect(store1536.searchable).toBe(true);

    const store768 = new MemoryStore({ embedder: make768Embedder() });
    expect(store768.searchable).toBe(false);
  });

  // 2. write with 1536-dim embedder embeds and passes the vector
  it("write() with 1536-dim embedder calls insertMemory with a 1536-length embedding", async () => {
    const store = new MemoryStore({ embedder: make1536Embedder() });
    await store.write({
      companyId: "co-1",
      domain: "test",
      kind: "fact",
      tier: "recall",
      content: "some content",
    });

    expect(insertMemory).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArg = ((insertMemory as ReturnType<typeof vi.fn>).mock.calls[0] as any[])[0];
    expect(Array.isArray(callArg.embedding)).toBe(true);
    expect(callArg.embedding).toHaveLength(MEMORY_EMBEDDING_DIM);
  });

  // 3. write with 768-dim embedder inserts with embedding: null (no throw)
  it("write() with 768-dim embedder stores embedding: null without throwing", async () => {
    const store = new MemoryStore({ embedder: make768Embedder() });
    await expect(
      store.write({
        companyId: "co-1",
        domain: "test",
        kind: "fact",
        tier: "recall",
        content: "some content",
      }),
    ).resolves.not.toThrow();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArg = ((insertMemory as ReturnType<typeof vi.fn>).mock.calls[0] as any[])[0];
    expect(callArg.embedding).toBeNull();
  });

  // 4. write when embed() throws → still inserts with embedding: null (graceful)
  it("write() when embed() throws still inserts with embedding: null and does not throw", async () => {
    const throwingEmbedder = make1536Embedder(() =>
      Promise.reject(new Error("network error")),
    );
    const store = new MemoryStore({ embedder: throwingEmbedder });

    await expect(
      store.write({
        companyId: "co-1",
        domain: "test",
        kind: "fact",
        tier: "recall",
        content: "content",
      }),
    ).resolves.not.toThrow();

    expect(insertMemory).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArg = ((insertMemory as ReturnType<typeof vi.fn>).mock.calls[0] as any[])[0];
    expect(callArg.embedding).toBeNull();
  });

  // 5. search with 1536-dim embedder embeds query and calls searchMemoryByEmbedding
  it("search() with 1536-dim embedder embeds query and returns DB results", async () => {
    const store = new MemoryStore({ embedder: make1536Embedder() });
    const results = await store.search("co-1", "query text", { topK: 3 });

    expect(searchMemoryByEmbedding).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstCall = (searchMemoryByEmbedding as ReturnType<typeof vi.fn>).mock.calls[0] as any[];
    const [cid, vec, opts] = firstCall;
    expect(cid).toBe("co-1");
    expect(Array.isArray(vec)).toBe(true);
    expect(vec).toHaveLength(1536);
    expect(opts).toMatchObject({ topK: 3 });
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty("distance");
  });

  // 6. search with non-1536 embedder returns [] without calling DB
  it("search() with a 768-dim embedder returns [] without calling searchMemoryByEmbedding", async () => {
    const store = new MemoryStore({ embedder: make768Embedder() });
    const results = await store.search("co-1", "query text");

    expect(searchMemoryByEmbedding).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  // 7. block() calls listMemory with tier:"block" and returns rows
  it("block() calls listMemory with tier:block and returns the rows", async () => {
    const store = new MemoryStore({ embedder: make768Embedder() });
    const rows = await store.block("co-1", { domain: "finance", kind: "rule" });

    expect(listMemory).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArg = ((listMemory as ReturnType<typeof vi.fn>).mock.calls[0] as any[])[0];
    expect(callArg).toMatchObject({
      companyId: "co-1",
      tier: "block",
      domain: "finance",
      kind: "rule",
    });
    expect(rows).toHaveLength(1);
  });
});
