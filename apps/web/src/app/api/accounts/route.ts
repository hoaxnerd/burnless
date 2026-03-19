import { NextResponse } from "next/server";
import { z } from "zod";
import { db, financialAccounts } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, parseBody, errorResponse } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["income", "expense", "asset", "liability", "equity"]),
  category: z.enum([
    "revenue", "cogs", "operating_expense", "other_income",
    "other_expense", "asset", "liability", "equity",
  ]),
  parentId: z.string().nullable().default(null),
  isSystem: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const rows = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.companyId, ctx.companyId))
    .orderBy(financialAccounts.sortOrder);

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const [row] = await db
    .insert(financialAccounts)
    .values({ companyId: ctx.companyId, ...parsed.data })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
