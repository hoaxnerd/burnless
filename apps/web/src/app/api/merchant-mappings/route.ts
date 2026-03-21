import { NextResponse } from "next/server";
import { z } from "zod";
import { db, merchantCategoryMappings } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { requireCompanyAccess, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { extractMerchantKey } from "@burnless/engine";

/** GET /api/merchant-mappings — list all merchant→category mappings for the company */
export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const rows = await db
    .select()
    .from(merchantCategoryMappings)
    .where(eq(merchantCategoryMappings.companyId, ctx.companyId))
    .orderBy(merchantCategoryMappings.updatedAt);

  return NextResponse.json(rows);
});

const upsertSchema = z.object({
  description: z.string().min(1),
  accountId: z.string(),
  category: z.enum([
    "revenue", "cogs", "operating_expense", "other_income",
    "other_expense", "asset", "liability", "equity",
  ]),
  subcategory: z.string().min(1),
});

/** POST /api/merchant-mappings — create or update a merchant mapping (user override) */
export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, upsertSchema);
  if ("error" in parsed) return parsed.error;

  const merchantPattern = extractMerchantKey(parsed.data.description);
  if (!merchantPattern) {
    return errorResponse("Could not extract merchant key from description", 400);
  }

  // Upsert: increment overrideCount if pattern already exists
  const existing = await db
    .select()
    .from(merchantCategoryMappings)
    .where(
      and(
        eq(merchantCategoryMappings.companyId, ctx.companyId),
        eq(merchantCategoryMappings.merchantPattern, merchantPattern),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(merchantCategoryMappings)
      .set({
        accountId: parsed.data.accountId,
        category: parsed.data.category,
        subcategory: parsed.data.subcategory,
        overrideCount: (existing[0]!.overrideCount ?? 1) + 1,
      })
      .where(eq(merchantCategoryMappings.id, existing[0]!.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [row] = await db
    .insert(merchantCategoryMappings)
    .values({
      companyId: ctx.companyId,
      merchantPattern,
      accountId: parsed.data.accountId,
      category: parsed.data.category,
      subcategory: parsed.data.subcategory,
      source: "user_override",
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
});
