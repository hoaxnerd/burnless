import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { financialAccounts, findByIdForCompany, updateForCompany, deleteForCompany } from "@burnless/db";
import { updateAccountSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

export const GET = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const row = await findByIdForCompany(financialAccounts, id, ctx.companyId);
  if (!row) return errorResponse("Account not found", 404);
  return NextResponse.json(row);
});

export const PATCH = withErrorHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await params;

  const parsed = await parseBody(request, updateAccountSchema);
  if ("error" in parsed) return parsed.error;

  const row = await updateForCompany(financialAccounts, id, ctx.companyId, parsed.data);
  if (!row) return errorResponse("Account not found", 404);
  await logAudit(ctx, "financial_account", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "accounts");
  revalidateTag("accounts");
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await params;

  const row = await deleteForCompany(financialAccounts, id, ctx.companyId);
  if (!row) return errorResponse("Account not found", 404);
  await logAudit(ctx, "financial_account", id, "delete", { before: row });
  await trackDataMutation(ctx.companyId, "accounts");
  revalidateTag("accounts");
  return NextResponse.json({ deleted: true });
});
