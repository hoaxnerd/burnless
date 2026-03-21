import { NextResponse } from "next/server";
import { db, importBatches, financialAccounts } from "@burnless/db";
import { eq, desc, lt } from "drizzle-orm";
import { and } from "drizzle-orm";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";

// -- GET /api/imports -- List import history with cursor pagination ----------

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const { limit, cursor } = parsePaginationParams(request);

  const conditions = [eq(importBatches.companyId, ctx.companyId)];
  if (cursor) conditions.push(lt(importBatches.id, cursor));

  const batches = await db
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      status: importBatches.status,
      totalRows: importBatches.totalRows,
      importedCount: importBatches.importedCount,
      skippedCount: importBatches.skippedCount,
      errorCount: importBatches.errorCount,
      accountId: importBatches.accountId,
      columnMapping: importBatches.columnMapping,
      rolledBackAt: importBatches.rolledBackAt,
      createdAt: importBatches.createdAt,
      accountName: financialAccounts.name,
    })
    .from(importBatches)
    .leftJoin(financialAccounts, eq(importBatches.accountId, financialAccounts.id))
    .where(and(...conditions))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit + 1);

  return NextResponse.json(paginatedResponse(batches, limit));
});
