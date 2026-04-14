import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, departments, resolveEntities, scenarioInsert } from "@burnless/db";
import { eq, and, gt } from "drizzle-orm";
import { createDepartmentSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { parsePaginationParams, paginatedResponse } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const scenarioId = getActiveScenario(request);

  // Fetch base departments for the company
  const base = await db
    .select()
    .from(departments)
    .where(eq(departments.companyId, ctx.companyId));

  // Resolve with scenario overrides
  const resolved = await resolveEntities("department", base, scenarioId);

  const usePagination = url.searchParams.has("limit");
  if (usePagination) {
    const { limit, cursor } = parsePaginationParams(request);
    const filtered = cursor ? resolved.filter((r) => r.id > cursor) : resolved;
    return NextResponse.json(paginatedResponse(filtered.slice(0, limit + 1), limit));
  }

  return NextResponse.json(resolved);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const scenarioId = getActiveScenario(request);

  const parsed = await parseBody(request, createDepartmentSchema);
  if ("error" in parsed) return parsed.error;

  const data = { companyId: ctx.companyId, ...parsed.data };
  const row = await scenarioInsert("department", departments, data, scenarioId);

  if (row) await logAudit(ctx, "department", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "departments");
  revalidateTag("departments");
  return NextResponse.json(row, { status: 201 });
});
