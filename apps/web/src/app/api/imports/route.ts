import { NextResponse } from "next/server";
import { db, importBatches, financialAccounts } from "@burnless/db";
import { eq, desc } from "drizzle-orm";
import { requireCompanyAccess, errorResponse } from "@/lib/api-helpers";

// ── GET /api/imports — List import history ──────────────────────────────────

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

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
    .where(eq(importBatches.companyId, ctx.companyId))
    .orderBy(desc(importBatches.createdAt))
    .limit(50);

  return NextResponse.json(batches);
}
