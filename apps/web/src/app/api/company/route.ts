import { NextResponse } from "next/server";
import { z } from "zod";
import { db, companies } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse } from "@/lib/api-helpers";

// ── GET /api/company — Get company profile ──────────────────────────────────

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, ctx.companyId))
    .limit(1);

  if (!company) return errorResponse("Company not found", 404);

  return NextResponse.json(company);
}

// ── PATCH /api/company — Update company profile ─────────────────────────────

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  stage: z
    .enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "bootstrapped"])
    .optional(),
  businessModel: z
    .enum(["saas", "marketplace", "ecommerce", "services", "hardware", "other"])
    .optional(),
  industry: z.string().max(200).nullable().optional(),
  currency: z.string().min(3).max(3).optional(),
  locale: z.string().min(2).max(10).optional(),
  timezone: z.string().min(1).max(100).optional(),
  region: z.enum(["us-east", "eu-west", "ap-south"]).optional(),
  fiscalYearEnd: z.number().min(1).max(12).optional(),
});

export async function PATCH(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, updateSchema);
  if ("error" in parsed) return parsed.error;

  const updates: Record<string, unknown> = {};
  const { name, stage, businessModel, industry, currency, locale, timezone, region, fiscalYearEnd } = parsed.data;

  if (name !== undefined) updates.name = name;
  if (stage !== undefined) updates.stage = stage;
  if (businessModel !== undefined) updates.businessModel = businessModel;
  if (industry !== undefined) updates.industry = industry;
  if (currency !== undefined) updates.currency = currency;
  if (locale !== undefined) updates.locale = locale;
  if (timezone !== undefined) updates.timezone = timezone;
  if (region !== undefined) updates.region = region;
  if (fiscalYearEnd !== undefined) updates.fiscalYearEnd = fiscalYearEnd;

  if (Object.keys(updates).length === 0) {
    return errorResponse("No fields to update", 400);
  }

  const [updated] = await db
    .update(companies)
    .set(updates)
    .where(eq(companies.id, ctx.companyId))
    .returning();

  return NextResponse.json(updated);
}
