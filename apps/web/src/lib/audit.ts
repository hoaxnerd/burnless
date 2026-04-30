/**
 * Financial audit logging — records all mutations to financial data.
 *
 * Usage in API routes:
 *   await logAudit(ctx, "transaction", txn.id, "create", { after: txn });
 *   await logAudit(ctx, "forecast_line", id, "update", { before: old, after: updated });
 *   await logAudit(ctx, "funding_round", id, "delete", { before: deleted });
 *
 * Fire-and-forget: audit failures are logged but never block the request.
 */

import { db, financialAuditLogs } from "@burnless/db";

export type AuditEntityType =
  | "transaction"
  | "financial_account"
  | "scenario"
  | "forecast_line"
  | "forecast_value"
  | "headcount_plan"
  | "revenue_stream"
  | "funding_round"
  | "import_batch"
  | "department"
  | "metric"
  | "salary_change"
  | "bonus"
  | "equity_grant";

export type AuditAction = "create" | "update" | "delete" | "import" | "rollback";

export interface AuditChanges {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface AuditContext {
  userId: string;
  companyId: string;
}

/**
 * Log a financial mutation to the audit trail.
 *
 * Non-blocking — catches and logs errors so it never breaks the caller.
 */
export async function logAudit(
  ctx: AuditContext,
  entityType: AuditEntityType,
  entityId: string,
  action: AuditAction,
  changes?: AuditChanges,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(financialAuditLogs).values({
      companyId: ctx.companyId,
      userId: ctx.userId,
      entityType,
      entityId,
      action,
      changes: changes ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    // Never let audit failures break the request
    console.error("[audit] Failed to log financial mutation:", err);
  }
}

/**
 * Log multiple audit entries in a single insert (e.g., bulk import).
 */
export async function logAuditBatch(
  ctx: AuditContext,
  entries: Array<{
    entityType: AuditEntityType;
    entityId: string;
    action: AuditAction;
    changes?: AuditChanges;
    metadata?: Record<string, unknown>;
  }>
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await db.insert(financialAuditLogs).values(
      entries.map((e) => ({
        companyId: ctx.companyId,
        userId: ctx.userId,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        changes: e.changes ?? null,
        metadata: e.metadata ?? null,
      }))
    );
  } catch (err) {
    console.error("[audit] Failed to log batch audit entries:", err);
  }
}
