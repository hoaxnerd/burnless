import { NextResponse } from "next/server";
import { z } from "zod";
import { db, transactions, financialAccounts } from "@burnless/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireCompanyAccess, parseBody, errorResponse } from "@/lib/api-helpers";
import crypto from "crypto";

// ── Schema ───────────────────────────────────────────────────────────────────

const importTransactionSchema = z.object({
  date: z.string(),
  amount: z.number(),
  description: z.string().nullable(),
  accountId: z.string(),
  externalId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const importSchema = z.object({
  transactions: z.array(importTransactionSchema).min(1).max(5000),
  dryRun: z.boolean().optional().default(false),
});

type ImportTransaction = z.infer<typeof importTransactionSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateExternalId(tx: ImportTransaction): string {
  const raw = `${tx.date}|${tx.amount}|${tx.description ?? ""}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `import:${hash}`;
}

/** Split an array into chunks of the given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── POST /api/import ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, importSchema);
  if ("error" in parsed) return parsed.error;

  const { transactions: txInput, dryRun } = parsed.data;

  // 1. Validate all referenced accountIds belong to this company
  const uniqueAccountIds = [...new Set(txInput.map((t) => t.accountId))];

  const validAccounts = await db
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.companyId, ctx.companyId),
        inArray(financialAccounts.id, uniqueAccountIds)
      )
    );

  const validAccountIdSet = new Set(validAccounts.map((a) => a.id));

  // 2. Build records and collect per-row errors
  const errors: Array<{ index: number; message: string }> = [];
  const prepared: Array<{
    index: number;
    companyId: string;
    accountId: string;
    date: Date;
    amount: string;
    description: string | null;
    source: "import";
    externalId: string;
    metadata: Record<string, unknown> | null;
  }> = [];

  for (let i = 0; i < txInput.length; i++) {
    const tx = txInput[i];

    // Validate account ownership
    if (!validAccountIdSet.has(tx.accountId)) {
      errors.push({ index: i, message: `Account ${tx.accountId} not found or not accessible` });
      continue;
    }

    // Validate date
    const parsedDate = new Date(tx.date);
    if (isNaN(parsedDate.getTime())) {
      errors.push({ index: i, message: `Invalid date: ${tx.date}` });
      continue;
    }

    const externalId = tx.externalId || generateExternalId(tx);

    prepared.push({
      index: i,
      companyId: ctx.companyId,
      accountId: tx.accountId,
      date: parsedDate,
      amount: String(tx.amount),
      description: tx.description ?? null,
      source: "import" as const,
      externalId,
      metadata: tx.metadata ?? null,
    });
  }

  // 3. Check for duplicates — find existing externalIds for this company
  const allExternalIds = prepared.map((p) => p.externalId);
  const existingDuplicates = new Set<string>();

  if (allExternalIds.length > 0) {
    // Check in chunks to avoid overly large IN clauses
    const idChunks = chunk(allExternalIds, 500);
    for (const idChunk of idChunks) {
      const existing = await db
        .select({ externalId: transactions.externalId })
        .from(transactions)
        .where(
          and(
            eq(transactions.companyId, ctx.companyId),
            inArray(transactions.externalId, idChunk)
          )
        );
      for (const row of existing) {
        if (row.externalId) existingDuplicates.add(row.externalId);
      }
    }
  }

  // Also detect in-batch duplicates (keep first occurrence)
  const seenInBatch = new Set<string>();
  const toInsert: typeof prepared = [];
  let skipped = 0;

  for (const row of prepared) {
    if (existingDuplicates.has(row.externalId) || seenInBatch.has(row.externalId)) {
      skipped++;
      continue;
    }
    seenInBatch.add(row.externalId);
    toInsert.push(row);
  }

  // 4. Dry run — return preview without inserting
  if (dryRun) {
    const preview = toInsert.map(({ index, ...rest }) => rest);
    return NextResponse.json({
      imported: toInsert.length,
      skipped,
      errors,
      transactions: preview,
    });
  }

  // 5. Batch insert (chunks of 100)
  const insertChunks = chunk(toInsert, 100);
  for (const batch of insertChunks) {
    const values = batch.map(({ index, ...rest }) => rest);
    await db.insert(transactions).values(values);
  }

  return NextResponse.json({
    imported: toInsert.length,
    skipped,
    errors,
  });
}
