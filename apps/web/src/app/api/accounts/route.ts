import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, financialAccounts, resolveEntities, scenarioInsert } from "@burnless/db";
import { eq, and, gt } from "drizzle-orm";
import { createAccountSchema } from "@burnless/types";
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

  // Fetch base financial accounts for the company
  const base = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.companyId, ctx.companyId))
    .orderBy(financialAccounts.sortOrder);

  // Resolve with scenario overrides
  const resolved = await resolveEntities("financial_account", base, scenarioId);

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

  const parsed = await parseBody(request, createAccountSchema);
  if ("error" in parsed) return parsed.error;

  const data = { companyId: ctx.companyId, ...parsed.data };
  const row = await scenarioInsert("financial_account", financialAccounts, data, scenarioId);

  if (row) await logAudit(ctx, "financial_account", row.id, "create", { after: row });
  await trackDataMutation(ctx.companyId, "accounts");
  revalidateTag("accounts");
  return NextResponse.json(row, { status: 201 });
});
