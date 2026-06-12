import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, scenarios, getOverrideCount } from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { updateScenarioSchema } from "@burnless/types";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";

/** Find a non-deleted scenario by ID scoped to company. */
async function findScenario(id: string, companyId: string) {
  const [row] = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, id), eq(scenarios.companyId, companyId), isNull(scenarios.deletedAt)))
    .limit(1);
  return row ?? null;
}

export const GET = withErrorHandler(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const row = await findScenario(id, ctx.companyId);
  if (!row) return errorResponse("Scenario not found", 404);

  const overrideCount = await getOverrideCount(id);
  return NextResponse.json({ ...row, overrideCount });
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

  // Verify scenario exists and is not soft-deleted
  const existing = await findScenario(id, ctx.companyId);
  if (!existing) return errorResponse("Scenario not found", 404);

  const parsed = await parseBody(request, updateScenarioSchema);
  if ("error" in parsed) return parsed.error;

  // Convert autoDeleteAt string to Date for Drizzle (schema field is timestamp)
  const { autoDeleteAt, ...rest } = parsed.data;
  const setData: Record<string, unknown> = { ...rest };
  if (autoDeleteAt !== undefined) {
    setData.autoDeleteAt = autoDeleteAt ? new Date(autoDeleteAt) : null;
  }

  const [row] = await db
    .update(scenarios)
    .set(setData)
    .where(and(eq(scenarios.id, id), eq(scenarios.companyId, ctx.companyId)))
    .returning();

  if (!row) return errorResponse("Scenario not found", 404);
  await logAudit(ctx, "scenario", id, "update", { after: row });
  await trackDataMutation(ctx.companyId, "scenarios");
  revalidateTag("scenarios", { expire: 0 });
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

  // Soft-delete: set deletedAt instead of hard delete
  const [row] = await db
    .update(scenarios)
    .set({ deletedAt: new Date() })
    .where(and(eq(scenarios.id, id), eq(scenarios.companyId, ctx.companyId), isNull(scenarios.deletedAt)))
    .returning();
  if (!row) return errorResponse("Scenario not found", 404);
  await logAudit(ctx, "scenario", id, "delete", { before: row });
  await trackDataMutation(ctx.companyId, "scenarios");
  revalidateTag("scenarios", { expire: 0 });
  return NextResponse.json({ deleted: true });
});
