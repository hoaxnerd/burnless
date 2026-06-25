import { and, cosineDistance, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../index";
import { memory } from "../schema";

export type MemoryRow = typeof memory.$inferSelect;

export interface InsertMemoryInput {
  companyId: string;
  userId?: string | null;
  domain: string;
  kind: string;
  tier: "block" | "recall";
  label?: string | null;
  content: string;
  embedding?: number[] | null;
  metadata?: unknown;
  readOnly?: boolean;
  expiresAt?: Date | null;
}

/** Insert one memory row. Tenancy is the caller's responsibility (companyId required). */
export async function insertMemory(input: InsertMemoryInput): Promise<MemoryRow> {
  const [row] = await db
    .insert(memory)
    .values({
      companyId: input.companyId,
      userId: input.userId ?? null,
      domain: input.domain,
      kind: input.kind,
      tier: input.tier,
      label: input.label ?? null,
      content: input.content,
      embedding: input.embedding ?? null,
      metadata: input.metadata ?? null,
      readOnly: input.readOnly ?? false,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return row!;
}

export interface ListMemoryFilter {
  companyId: string;
  domain?: string;
  kind?: string;
  tier?: "block" | "recall";
}

/** List memory rows for a company, optionally narrowed by domain/kind/tier. Newest first. */
export async function listMemory(filter: ListMemoryFilter): Promise<MemoryRow[]> {
  const conds = [eq(memory.companyId, filter.companyId)];
  if (filter.domain !== undefined) conds.push(eq(memory.domain, filter.domain));
  if (filter.kind !== undefined) conds.push(eq(memory.kind, filter.kind));
  if (filter.tier !== undefined) conds.push(eq(memory.tier, filter.tier));
  return db
    .select()
    .from(memory)
    .where(and(...conds))
    .orderBy(desc(memory.createdAt));
}

export interface SearchMemoryOpts {
  domain?: string;
  kind?: string;
  topK?: number;
}

/**
 * Cosine-similarity search over recall-tier rows with a non-null embedding, for
 * ONE company. Returns rows ordered by ascending cosine distance (closest
 * first), each annotated with its numeric `distance`. Pure DB query — no
 * embedding logic (the caller passes an already-computed 1536-dim query
 * vector). Block-tier and null-embedding rows are never returned.
 */
export async function searchMemoryByEmbedding(
  companyId: string,
  queryEmbedding: number[],
  opts: SearchMemoryOpts = {},
): Promise<Array<MemoryRow & { distance: number }>> {
  const distance = sql<number>`${cosineDistance(memory.embedding, queryEmbedding)}`;
  const conds = [
    eq(memory.companyId, companyId),
    eq(memory.tier, "recall"),
    isNotNull(memory.embedding),
  ];
  if (opts.domain !== undefined) conds.push(eq(memory.domain, opts.domain));
  if (opts.kind !== undefined) conds.push(eq(memory.kind, opts.kind));
  const rows = await db
    .select({ row: memory, distance })
    .from(memory)
    .where(and(...conds))
    .orderBy(distance)
    .limit(opts.topK ?? 5);
  return rows.map((r) => ({ ...r.row, distance: r.distance }));
}

/** Tenancy-safe delete: only deletes if the row belongs to companyId. Returns the row or null. */
export async function deleteMemoryById(id: string, companyId: string): Promise<MemoryRow | null> {
  const [row] = await db
    .delete(memory)
    .where(and(eq(memory.id, id), eq(memory.companyId, companyId)))
    .returning();
  return row ?? null;
}
