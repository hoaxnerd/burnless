import { db, transactions } from "@burnless/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * A transaction row ready for insertion. The caller has already resolved the
 * account, formatted the amount, and assigned a stable `externalId` — this core
 * does NOT categorize and does NOT resolve accounts.
 *
 * Amounts cross the money boundary as STRINGS (the `transactions.amount` column
 * is `numeric`). Never do `number` arithmetic on `amount` (Decimal-at-boundary).
 */
export interface IngestRow {
  accountId: string;
  date: Date;
  amount: string;
  description: string | null;
  vendor: string | null;
  /** Optional free-text note. Omitted by connectors; carried through by CSV import. */
  notes?: string | null;
  source: "manual" | "import" | "integration" | "forecast";
  externalId: string;
  metadata: Record<string, unknown> | null;
}

export interface IngestResult {
  inserted: number;
  skipped: number;
}

/** Mirror of the chunk util the import route uses (kept identical on purpose). */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Shared ingestion core: chunked `(companyId, externalId)` dedup against the DB
 * + an in-batch `seenInBatch` Set + chunked insert into `transactions`.
 *
 * Idempotent on `(companyId, externalId)`: re-running the same records inserts 0.
 * In-batch duplicates are skipped once. Pure DB logic — no HTTP/Next concerns.
 *
 * Lifted verbatim from `apps/web/src/app/api/import/route.ts` so the CSV import
 * and the Stripe connector share one dedup+insert path.
 */
export async function ingestRecords(
  companyId: string,
  records: IngestRow[],
  opts?: { importBatchId?: string | null }
): Promise<IngestResult> {
  const importBatchId = opts?.importBatchId ?? null;

  // 1. Check for duplicates already in the DB (chunked inArray on externalId).
  const allExternalIds = records.map((r) => r.externalId);
  const existingDuplicates = new Set<string>();

  if (allExternalIds.length > 0) {
    const idChunks = chunk(allExternalIds, 500);
    for (const idChunk of idChunks) {
      const existing = await db
        .select({ externalId: transactions.externalId })
        .from(transactions)
        .where(
          and(
            eq(transactions.companyId, companyId),
            inArray(transactions.externalId, idChunk)
          )
        );
      for (const row of existing) {
        if (row.externalId) existingDuplicates.add(row.externalId);
      }
    }
  }

  // 2. Drop DB duplicates + in-batch duplicates.
  const seenInBatch = new Set<string>();
  const toInsert: IngestRow[] = [];
  let skipped = 0;

  for (const row of records) {
    if (existingDuplicates.has(row.externalId) || seenInBatch.has(row.externalId)) {
      skipped++;
      continue;
    }
    seenInBatch.add(row.externalId);
    toInsert.push(row);
  }

  // 3. Chunked insert, carrying each row's own `source` and the optional batch id.
  const insertChunks = chunk(toInsert, 100);
  for (const batchChunk of insertChunks) {
    const values = batchChunk.map((row) => ({
      companyId,
      accountId: row.accountId,
      date: row.date,
      amount: row.amount,
      description: row.description,
      vendor: row.vendor,
      notes: row.notes ?? null,
      source: row.source,
      externalId: row.externalId,
      importBatchId,
      metadata: row.metadata,
    }));
    await db.insert(transactions).values(values);
  }

  return { inserted: toInsert.length, skipped };
}
