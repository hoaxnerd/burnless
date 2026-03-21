import { NextResponse } from "next/server";
import { z } from "zod";
import { db, departments } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().default(null),
});

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const rows = await db.select().from(departments).where(eq(departments.companyId, ctx.companyId));
  return NextResponse.json(rows);
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db.insert(departments).values({ companyId: ctx.companyId, ...parsed.data }).returning();
  return NextResponse.json(row, { status: 201 });
});
