import { and, desc, eq } from "drizzle-orm";
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

/** Tenancy-safe delete: only deletes if the row belongs to companyId. Returns the row or null. */
export async function deleteMemoryById(id: string, companyId: string): Promise<MemoryRow | null> {
  const [row] = await db
    .delete(memory)
    .where(and(eq(memory.id, id), eq(memory.companyId, companyId)))
    .returning();
  return row ?? null;
}
