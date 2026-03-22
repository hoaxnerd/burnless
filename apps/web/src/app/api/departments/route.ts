import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, departments } from "@burnless/db";
import { eq, and, gt } from "drizzle-orm";
import { createDepartmentSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const usePagination = url.searchParams.has("limit");

  if (usePagination) {
    const { limit, cursor } = parsePaginationParams(request);
    const where = cursor
      ? and(eq(departments.companyId, ctx.companyId), gt(departments.id, cursor))
      : eq(departments.companyId, ctx.companyId);
    const rows = await db.select().from(departments).where(where).limit(limit + 1);
    return NextResponse.json(paginatedResponse(rows, limit));
  }

  const rows = await db.select().from(departments).where(eq(departments.companyId, ctx.companyId));
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createDepartmentSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db.insert(departments).values({ companyId: ctx.companyId, ...parsed.data }).returning();
  if (row) await logAudit(ctx, "department", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "departments");
  revalidateTag("departments");
  return NextResponse.json(row, { status: 201 });
});
