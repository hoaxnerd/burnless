import { NextResponse } from "next/server";
import { db, importBatches, transactions } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, requireRole, errorResponse, withErrorHandler } from "@/lib/api-helpers";

// ── DELETE /api/imports/[batchId] — Rollback an import batch ────────────────

export const DELETE = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const { batchId } = await params;

  // Verify batch belongs to this company and is rollback-eligible
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.id, batchId),
        eq(importBatches.companyId, ctx.companyId)
      )
    )
    .limit(1);

  if (!batch) {
    return errorResponse("Import batch not found", 404);
  }

  if (batch.status === "rolled_back") {
    return errorResponse("Batch has already been rolled back", 400);
  }

  if (batch.status !== "completed") {
    return errorResponse("Only completed imports can be rolled back", 400);
  }

  // Delete all transactions in this batch
  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.companyId, ctx.companyId),
        eq(transactions.importBatchId, batchId)
      )
    );

  // Mark batch as rolled back
  await db
    .update(importBatches)
    .set({ status: "rolled_back", rolledBackAt: new Date() })
    .where(eq(importBatches.id, batchId));

  return NextResponse.json({
    success: true,
    message: `Rolled back ${batch.importedCount} transactions`,
  });
});
