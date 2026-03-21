import { NextResponse } from "next/server";
import { z } from "zod";
import { db, transactions, financialAccounts, importBatches, merchantCategoryMappings } from "@burnless/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { categorizeWithMemory, type MerchantMapping } from "@burnless/engine";
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
  fileName: z.string().optional().default("import.csv"),
  columnMapping: z.record(z.string()).optional(),
});

type ImportTransaction = z.infer<typeof importTransactionSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateExternalId(tx: ImportTransaction): string {
  const raw = `${tx.date}|${tx.amount}|${tx.description ?? ""}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `import:${hash}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── POST /api/import ─────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, importSchema);
  if ("error" in parsed) return parsed.error;

  const { transactions: txInput, dryRun, fileName, columnMapping } = parsed.data;

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

  // 2. Load merchant memory for this company
  const merchantRows = await db
    .select()
    .from(merchantCategoryMappings)
    .where(eq(merchantCategoryMappings.companyId, ctx.companyId));

  const merchantMemory: MerchantMapping[] = merchantRows.map((r) => ({
    merchantPattern: r.merchantPattern,
    category: r.category,
    subcategory: r.subcategory,
    accountId: r.accountId,
  }));

  // 3. Build records and collect per-row errors, run AI categorization
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
    importBatchId: string | null;
    metadata: Record<string, unknown> | null;
    suggestedCategory?: string;
    categoryConfidence?: number;
    categorySource?: string;
  }> = [];

  for (let i = 0; i < txInput.length; i++) {
    const tx = txInput[i]!;

    if (!validAccountIdSet.has(tx.accountId)) {
      errors.push({ index: i, message: `Account ${tx.accountId} not found or not accessible` });
      continue;
    }

    const parsedDate = new Date(tx.date);
    if (isNaN(parsedDate.getTime())) {
      errors.push({ index: i, message: `Invalid date: ${tx.date}` });
      continue;
    }

    const externalId = tx.externalId || generateExternalId(tx);

    // AI categorization with merchant memory
    let suggestedCategory: string | undefined;
    let categoryConfidence: number | undefined;
    let categorySource: string | undefined;
    if (tx.description) {
      const result = categorizeWithMemory(tx.description, merchantMemory);
      if (result) {
        suggestedCategory = result.subcategory;
        categoryConfidence = result.confidence;
        categorySource = result.source;
      }
    }

    prepared.push({
      index: i,
      companyId: ctx.companyId,
      accountId: tx.accountId,
      date: parsedDate,
      amount: String(tx.amount),
      description: tx.description ?? null,
      source: "import" as const,
      externalId,
      importBatchId: null,
      metadata: {
        ...(tx.metadata ?? {}),
        ...(suggestedCategory
          ? {
              aiCategory: suggestedCategory,
              aiCategoryConfidence: categoryConfidence,
              aiCategorySource: categorySource,
            }
          : {}),
      },
      suggestedCategory,
      categoryConfidence,
      categorySource,
    });
  }

  // 3. Check for duplicates
  const allExternalIds = prepared.map((p) => p.externalId);
  const existingDuplicates = new Set<string>();

  if (allExternalIds.length > 0) {
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

  // 4. Dry run — return preview with AI categorization
  if (dryRun) {
    const preview = prepared.map(({ index: _index, suggestedCategory, categoryConfidence, categorySource, importBatchId: _importBatchId, ...rest }) => ({
      ...rest,
      isDuplicate: existingDuplicates.has(rest.externalId) || false,
      suggestedCategory,
      categoryConfidence,
      categorySource,
    }));
    return NextResponse.json({
      imported: toInsert.length,
      skipped,
      errors,
      transactions: preview,
    });
  }

  // 5. Create import batch record
  const [batch] = await db
    .insert(importBatches)
    .values({
      companyId: ctx.companyId,
      fileName,
      status: "processing",
      totalRows: txInput.length,
      accountId: uniqueAccountIds[0] ?? null,
      columnMapping: columnMapping ?? null,
    })
    .returning();

  // 6. Batch insert with batchId
  try {
    const insertChunks = chunk(toInsert, 100);
    for (const batchChunk of insertChunks) {
      const values = batchChunk.map(({ index: _index, suggestedCategory: _suggestedCategory, categoryConfidence: _categoryConfidence, categorySource: _categorySource, ...rest }) => ({
        ...rest,
        importBatchId: batch!.id,
      }));
      await db.insert(transactions).values(values);
    }

    // Update batch to completed
    await db
      .update(importBatches)
      .set({
        status: "completed",
        importedCount: toInsert.length,
        skippedCount: skipped,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : null,
      })
      .where(eq(importBatches.id, batch!.id));

    return NextResponse.json({
      imported: toInsert.length,
      skipped,
      errors,
      batchId: batch!.id,
    });
  } catch (e) {
    // Mark batch as failed
    await db
      .update(importBatches)
      .set({ status: "failed", errors: [{ message: String(e) }] })
      .where(eq(importBatches.id, batch!.id));

    return errorResponse("Import failed", 500);
  }
});
