import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { departments, scenarioUpdate, scenarioDelete } from "@burnless/db";
import { updateDepartmentSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";
import { depthAtParent, subtreeDepthFrom, DEPT_MAX_DEPTH } from "@/lib/department-depth";

export const PATCH = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const scenarioId = getActiveScenario(request);

  const parsed = await parseBody(request, updateDepartmentSchema);
  if ("error" in parsed) return parsed.error;

  if (parsed.data.parentId !== undefined) {
    // Disallow self-parenting before walking the chain.
    if (parsed.data.parentId === id) {
      return NextResponse.json(
        { error: "Cannot set department as its own parent", code: "DEPT_SELF_PARENT" },
        { status: 400 },
      );
    }
    // The moved node + its subtree must fit. depthAtParent gives the depth of the
    // node post-move; subtreeDepthFrom gives the deepest descendant relative to the moved node.
    const newDepth = await depthAtParent(ctx.companyId, parsed.data.parentId);
    const subtreeDepth = await subtreeDepthFrom(ctx.companyId, id);
    const finalMax = newDepth + subtreeDepth - 1;
    if (finalMax > DEPT_MAX_DEPTH) {
      return NextResponse.json(
        { error: "Department hierarchy capped at 3 levels", code: "DEPT_DEPTH_EXCEEDED" },
        { status: 400 },
      );
    }
  }

  const row = await scenarioUpdate("department", departments, id, parsed.data, scenarioId);
  if (!row) return errorResponse("Department not found", 404);
  await logAudit(ctx, "department", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "departments");
  revalidateTag("departments");
  return NextResponse.json(row);
});

export const DELETE = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;
  const { id } = await context.params;

  const scenarioId = getActiveScenario(request);

  await scenarioDelete("department", departments, id, scenarioId);
  await logAudit(ctx, "department", id, "delete", {});
  await trackDataMutation(ctx.companyId, "departments");
  revalidateTag("departments");
  return NextResponse.json({ deleted: true });
});
