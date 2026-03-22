import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, financialAccounts } from "@burnless/db";
import { eq, and, gt } from "drizzle-orm";
import { createAccountSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const usePagination = url.searchParams.has("limit");

  if (usePagination) {
    const { limit, cursor } = parsePaginationParams(request);
    const where = cursor
      ? and(eq(financialAccounts.companyId, ctx.companyId), gt(financialAccounts.id, cursor))
      : eq(financialAccounts.companyId, ctx.companyId);
    const rows = await db.select().from(financialAccounts).where(where).orderBy(financialAccounts.sortOrder).limit(limit + 1);
    return NextResponse.json(paginatedResponse(rows, limit));
  }

  const rows = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.companyId, ctx.companyId))
    .orderBy(financialAccounts.sortOrder);

  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createAccountSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db
    .insert(financialAccounts)
    .values({ companyId: ctx.companyId, ...parsed.data })
    .returning();

  if (row) await logAudit(ctx, "financial_account", row.id, "create", { after: row });
  revalidateTag("accounts");
  return NextResponse.json(row, { status: 201 });
});
