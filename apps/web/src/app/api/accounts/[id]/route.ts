import { NextResponse } from "next/server";
import { z } from "zod";
import { financialAccounts, findByIdForCompany, updateForCompany, deleteForCompany } from "@burnless/db";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["income", "expense", "asset", "liability", "equity"]).optional(),
  category: z.enum([
    "revenue", "cogs", "operating_expense", "other_income",
    "other_expense", "asset", "liability", "equity",
  ]).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

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

  const parsed = await parseBody(request, updateSchema);
  if ("error" in parsed) return parsed.error;

  const row = await updateForCompany(financialAccounts, id, ctx.companyId, parsed.data);
  if (!row) return errorResponse("Account not found", 404);
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
  return NextResponse.json({ deleted: true });
});
