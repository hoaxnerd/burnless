import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { departments, updateForCompany, deleteForCompany } from "@burnless/db";
import { updateDepartmentSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

export const PATCH = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const parsed = await parseBody(request, updateDepartmentSchema);
  if ("error" in parsed) return parsed.error;

  const row = await updateForCompany(departments, id, ctx.companyId, parsed.data);
  if (!row) return errorResponse("Department not found", 404);
  await logAudit(ctx, "department", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "departments");
  revalidateTag("departments");
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const row = await deleteForCompany(departments, id, ctx.companyId);
  if (!row) return errorResponse("Department not found", 404);
  await logAudit(ctx, "department", id, "delete", { before: row });
  await trackDataMutation(ctx.companyId, "departments");
  revalidateTag("departments");
  return NextResponse.json({ deleted: true });
});
