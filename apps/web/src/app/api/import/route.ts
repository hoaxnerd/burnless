import { NextResponse } from "next/server";
import { z } from "zod";
import { db, transactions, financialAccounts, importBatches, merchantCategoryMappings, fundingRounds } from "@burnless/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/api-rate-limit";
import { categorizeWithMemory, type MerchantMapping } from "@burnless/engine";
import { monetaryAmount } from "@/lib/financial-validation";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import type { FundingRoundColumnMapping } from "@/app/(dashboard)/import/import-utils";
import crypto from "crypto";

// ── Funding import handler (Phase 2 D D9) ────────────────────────────────────

async function handleFundingImport(
  body: { rounds: Array<Record<string, string>>; mapping: FundingRoundColumnMapping; dryRun: boolean },
  ctx: { companyId: string },
) {
  const errors: Array<{ rowNumber: number; field: string; message: string }> = [];
  const toInsert: (typeof fundingRounds.$inferInsert)[] = [];
  const skipped: number[] = [];

  for (let i = 0; i < body.rounds.length; i++) {
    const row = body.rounds[i]!;
    const m = body.mapping;
    try {
      const name = row[m.name];
      const roundType = row[m.roundType];
      const amount = Number(String(row[m.amount] ?? "").replace(/[$,]/g, ""));
      const date = row[m.date];
      if (!name || !roundType || !amount || !date) {
        errors.push({ rowNumber: i + 1, field: "required", message: "Missing required field" });
        continue;
      }
      // Dedupe key: (companyId, name, closeDate)
      const closeDate = m.closeDate ? (row[m.closeDate] ?? null) : null;
      const exists = await db
        .select({ id: fundingRounds.id })
        .from(fundingRounds)
        .where(
          and(
            eq(fundingRounds.companyId, ctx.companyId),
            eq(fundingRounds.name, name),
            closeDate ? eq(fundingRounds.closeDate, new Date(closeDate)) : sql`close_date IS NULL`,
          ),
        );
      if (exists.length > 0) {
        skipped.push(i + 1);
        continue;
      }
      const parameters: Record<string, unknown> = {};
      if (m.valuationCap && row[m.valuationCap]) parameters.valuationCap = Number(row[m.valuationCap]);
      if (m.discountRate && row[m.discountRate]) parameters.discountRate = Number(row[m.discountRate]!) / 100;
      if (m.interestRate && row[m.interestRate]) parameters.interestRate = Number(row[m.interestRate]!) / 100;
      if (m.termMonths && row[m.termMonths]) parameters.termMonths = Number(row[m.termMonths]);
      toInsert.push({
        companyId: ctx.companyId,
        name,
        type: roundType as "pre_seed" | "seed" | "series_a" | "series_b" | "series_c_plus" | "debt" | "grant" | "safe" | "convertible",
        amount: String(amount),
        date: new Date(date),
        closeDate: closeDate ? new Date(closeDate) : null,
        notes: m.notes ? (row[m.notes] ?? null) : null,
        parameters,
      });
    } catch (err: unknown) {
      errors.push({ rowNumber: i + 1, field: "parse", message: String((err as Error).message ?? err) });
    }
  }

  if (body.dryRun) {
    return NextResponse.json({
      target: "funding-rounds",
      imported: toInsert.length,
      skipped: skipped.length,
      errors,
      preview: toInsert,
    });
  }

  if (toInsert.length > 0) {
    await db.insert(fundingRounds).values(toInsert);
    revalidateTag("funding-rounds", { expire: 0 });
    revalidateTag("cap-table", { expire: 0 });
  }
  return NextResponse.json({
    target: "funding-rounds",
    imported: toInsert.length,
    skipped: skipped.length,
    errors,
  });
}

// ── Schema ───────────────────────────────────────────────────────────────────

const importTransactionSchema = z.object({
  date: z.string(),
  amount: monetaryAmount(),
  description: z.string().nullable(),
  accountId: z.string(),
  externalId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  vendor: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // DATA-08: optional per-row category override from the import preview. When
  // present it wins over server-side re-categorization; persisted in metadata
  // (transactions have no dedicated category column).
  category: z.string().optional(),
});

// columnMapping values are usually a single source-column name, but the
// `amount` slot may be the polymorphic { debit, credit } shape when the file
// has separate Debit and Credit columns (Phase 1 §2.C D1).
const columnMappingValueSchema = z.union([
  z.string(),
  z.object({ debit: z.string(), credit: z.string() }),
]);

const importSchema = z.object({
  transactions: z.array(importTransactionSchema).min(1).max(5000),
  dryRun: z.boolean().optional().default(false),
  fileName: z.string().optional().default("import.csv"),
  columnMapping: z.record(columnMappingValueSchema).optional(),
});

type ImportTransaction = z.infer<typeof importTransactionSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateExternalId(tx: ImportTransaction, accountId: string): string {
  const raw = `${tx.date}|${tx.amount}|${tx.description ?? ""}|${accountId}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `import:${hash}`;
}

const IMPORTED_ACCOUNT_NAME = "Imported";
const IMPORTED_ACCOUNT_SENTINEL = "__imported__";

async function ensureImportedAccount(companyId: string): Promise<string> {
  const existing = await db
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.companyId, companyId),
        eq(financialAccounts.name, IMPORTED_ACCOUNT_NAME)
      )
    )
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(financialAccounts)
    .values({
      companyId,
      name: IMPORTED_ACCOUNT_NAME,
      type: "expense",
      category: "operating_expense",
    })
    .returning({ id: financialAccounts.id });

  return created!.id;
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
  const blocked = await applyRateLimit(request, "import");
  if (blocked) return blocked;

  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  // Peek at target before full schema parse so funding rounds can use a different shape.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  const target = (rawBody as Record<string, unknown>)?.target ?? "transactions";

  if (target === "funding-rounds") {
    const fundingBody = rawBody as {
      rounds: Array<Record<string, string>>;
      mapping: FundingRoundColumnMapping;
      dryRun: boolean;
    };
    return handleFundingImport(fundingBody, { companyId: ctx.companyId });
  }

  // Transaction branch — re-validate using the existing schema (parseBody reads
  // request.json() internally, but since we already consumed the stream we pass
  // the raw body through a synthetic wrapper).
  const parsed = await z.object({
    transactions: importSchema.shape.transactions,
    dryRun: importSchema.shape.dryRun,
    fileName: importSchema.shape.fileName,
    columnMapping: importSchema.shape.columnMapping,
  }).safeParseAsync(rawBody);
  if (!parsed.success) {
    return errorResponse("Validation failed", 400);
  }

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
    vendor: string | null;
    notes: string | null;
    source: "import";
    externalId: string;
    importBatchId: string | null;
    metadata: Record<string, unknown> | null;
    suggestedCategory?: string;
    categoryConfidence?: number;
    categorySource?: string;
  }> = [];

  let importedAccountId: string | null = null;

  for (let i = 0; i < txInput.length; i++) {
    const tx = txInput[i]!;

    let resolvedAccountId: string;
    if (tx.accountId === "" || tx.accountId === IMPORTED_ACCOUNT_SENTINEL) {
      importedAccountId ??= await ensureImportedAccount(ctx.companyId);
      resolvedAccountId = importedAccountId;
    } else if (!validAccountIdSet.has(tx.accountId)) {
      errors.push({ index: i, message: `Account ${tx.accountId} not found or not accessible` });
      continue;
    } else {
      resolvedAccountId = tx.accountId;
    }

    const parsedDate = new Date(tx.date);
    if (isNaN(parsedDate.getTime())) {
      errors.push({ index: i, message: `Invalid date: ${tx.date}` });
      continue;
    }

    const externalId = tx.externalId || generateExternalId(tx, resolvedAccountId);

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
    // DATA-08: an explicit per-row category override wins over the auto result.
    // Recorded as a high-confidence "manual" categorization so downstream
    // consumers treat it as user-confirmed rather than a guess.
    if (tx.category) {
      suggestedCategory = tx.category;
      categoryConfidence = 1;
      categorySource = "manual";
    }

    prepared.push({
      index: i,
      companyId: ctx.companyId,
      accountId: resolvedAccountId,
      date: parsedDate,
      amount: String(tx.amount),
      description: tx.description ?? null,
      vendor: tx.vendor ?? null,
      notes: tx.notes ?? null,
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
      // `prepared.amount` is a string (Drizzle numeric column shape).
      // The client round-trips this preview back to POST /api/import on
      // confirm; the importTransactionSchema expects amount as a number,
      // so coerce here to keep the round-trip consistent.
      amount: Number(rest.amount),
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

    await trackDataMutation(ctx.companyId, "expenses");

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
