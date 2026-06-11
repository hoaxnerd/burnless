import { NextResponse } from "next/server";
import { z } from "zod";
import { db, companies, hasFinancialData } from "@burnless/db";
import { eq } from "drizzle-orm";
import { requireCompanyAccess, requireRole, parseBody, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { CURRENCY_CODES, percentage } from "@burnless/types";
import { ConfirmableError } from "@/lib/confirmable-error";

// ── GET /api/company — Get company profile ──────────────────────────────────

export const GET = withErrorHandler(async (_request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, ctx.companyId))
    .limit(1);

  if (!company) return errorResponse("Company not found", 404);

  return NextResponse.json(company);
});

// ── PATCH /api/company — Update company profile ─────────────────────────────

// Phase 1 §2.E: country-agnostic 4-component employer benefits breakdown
// applied as defaults for new hires that omit a per-hire override.
const benefitsRatesSchema = z.object({
  statutoryEmployerContributions: z.number().min(0).max(1),
  insuranceBenefits: z.number().min(0).max(1),
  retirementContributions: z.number().min(0).max(1),
  otherBenefits: z.number().min(0).max(1),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  stage: z
    .enum(["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "bootstrapped"])
    .optional(),
  businessModel: z
    .enum(["saas", "marketplace", "ecommerce", "services", "hardware", "other"])
    .optional(),
  industry: z.string().max(200).nullable().optional(),
  currency: z.enum(CURRENCY_CODES).optional(),
  locale: z.string().min(2).max(10).optional(),
  timezone: z.string().min(1).max(100).optional(),
  region: z.enum(["us-east", "eu-west", "ap-south"]).optional(),
  fiscalYearEnd: z.number().min(1).max(12).optional(),
  benefitsRates: benefitsRatesSchema.optional(),
  // Cap-table founder common-stock ownership (0-100). numeric(7,4) column ->
  // String()-coerced below (the bug class that 500'd a funding save).
  foundersOwnershipPercent: percentage().optional(),
  /** B8 MCP kill switch (expose spec §3) — admin+ via the route's requireRole. */
  mcpServerEnabled: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "admin");
  if (roleErr) return roleErr;

  const parsed = await parseBody(request, updateSchema);
  if ("error" in parsed) return parsed.error;

  // Load existing company once — needed for currency-change detection.
  const [existing] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, ctx.companyId))
    .limit(1);
  if (!existing) return errorResponse("Company not found", 404);

  // Currency-change confirm gate (umbrella §1.6 mutability rule).
  if (parsed.data.currency && parsed.data.currency !== (existing.currency as string)) {
    const url = new URL(request.url);
    const confirmed = url.searchParams.get("confirm") === "true";
    if (!confirmed && (await hasFinancialData(ctx.companyId))) {
      throw new ConfirmableError(
        `Changing currency from ${existing.currency} to ${parsed.data.currency} will not convert existing financial data. Symbols on historic amounts will change even though the numbers do not. Confirm to proceed.`,
        "CURRENCY_CHANGE_REQUIRES_CONFIRMATION",
        { from: existing.currency, to: parsed.data.currency }
      );
    }
  }

  const updates: Record<string, unknown> = {};
  const { name, stage, businessModel, industry, currency, locale, timezone, region, fiscalYearEnd, benefitsRates, foundersOwnershipPercent, mcpServerEnabled } = parsed.data;

  if (name !== undefined) updates.name = name;
  if (stage !== undefined) updates.stage = stage;
  if (businessModel !== undefined) updates.businessModel = businessModel;
  if (industry !== undefined) updates.industry = industry;
  if (currency !== undefined) updates.currency = currency;
  if (locale !== undefined) updates.locale = locale;
  if (timezone !== undefined) updates.timezone = timezone;
  if (region !== undefined) updates.region = region;
  if (fiscalYearEnd !== undefined) updates.fiscalYearEnd = fiscalYearEnd;
  if (benefitsRates !== undefined) updates.benefitsRates = benefitsRates;
  if (foundersOwnershipPercent !== undefined) updates.foundersOwnershipPercent = String(foundersOwnershipPercent);
  if (mcpServerEnabled !== undefined) updates.mcpServerEnabled = mcpServerEnabled;

  if (Object.keys(updates).length === 0) {
    return errorResponse("No fields to update", 400);
  }

  const [updated] = await db
    .update(companies)
    .set(updates)
    .where(eq(companies.id, ctx.companyId))
    .returning();

  return NextResponse.json(updated);
});
