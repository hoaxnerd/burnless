import { NextResponse } from "next/server";
import { db, financialAuditLogs } from "@burnless/db";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireCompanyAccess, requireRole, withErrorHandler } from "@/lib/api-helpers";

/**
 * GET /api/audit — Query financial audit trail for the authenticated company.
 *
 * Query params:
 *   entityType — filter by entity type (e.g. "transaction", "scenario")
 *   entityId   — filter by specific entity ID
 *   limit      — max results (default 50, max 200)
 *   cursor     — cursor for pagination (ISO timestamp of last result)
 */
export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Audit trail is admin-only — viewers/editors shouldn't browse all mutations
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );
  const cursor = url.searchParams.get("cursor");

  const conditions = [eq(financialAuditLogs.companyId, ctx.companyId)];

  if (entityType) {
    conditions.push(
      eq(
        financialAuditLogs.entityType,
        entityType as typeof financialAuditLogs.entityType.enumValues[number]
      )
    );
  }
  if (entityId) {
    conditions.push(eq(financialAuditLogs.entityId, entityId));
  }
  if (cursor) {
    conditions.push(lt(financialAuditLogs.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select()
    .from(financialAuditLogs)
    .where(and(...conditions))
    .orderBy(desc(financialAuditLogs.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem
    ? lastItem.createdAt.toISOString()
    : null;

  return NextResponse.json({ data, nextCursor });
});
