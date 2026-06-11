/**
 * POST /api/onboarding — Creates a company + scaffolding only: the company,
 * the owner membership, a base scenario, default accounts, default
 * departments, and the (disabled) aiFeatureFlags row.
 *
 * Wrapped in a transaction so partial failures don't leave orphaned records.
 *
 * Detailed entities (revenue streams, funding rounds, headcount, expenses) are
 * NO LONGER created here. The S4b onboarding wizard creates the company first
 * (via this route), then drives the REAL per-domain endpoints for each detail.
 * If a body still carries those arrays they are silently ignored.
 */

import { NextResponse } from "next/server";
import {
  db,
  companies,
  companyMembers,
  scenarios,
  financialAccounts,
  departments,
  aiFeatureFlags,
  users,
} from "@burnless/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getAuthUser, getUserCompany, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import {
  onboardingSchema,
  parseStage,
  parseBusinessModel,
} from "@/lib/onboarding-helpers";

const DEFAULT_ACCOUNTS = [
  { name: "Revenue", type: "income", category: "revenue", isSystem: true },
  { name: "Cost of Goods Sold", type: "expense", category: "cogs", isSystem: true },
  { name: "Salaries & Payroll", type: "expense", category: "operating_expense", isSystem: false, coversHeadcount: true },
  { name: "Cloud Infrastructure", type: "expense", category: "operating_expense", isSystem: false },
  { name: "Marketing", type: "expense", category: "operating_expense", isSystem: false },
  { name: "Office & Admin", type: "expense", category: "operating_expense", isSystem: false },
  { name: "Software & Tools", type: "expense", category: "operating_expense", isSystem: false },
  { name: "Cash & Bank", type: "asset", category: "asset", isSystem: true },
  { name: "Equity", type: "equity", category: "equity", isSystem: true },
] as const;

const DEFAULT_DEPARTMENTS = [
  "Engineering",
  "Sales",
  "Marketing",
  "Operations",
  "General & Admin",
] as const;

export const POST = withErrorHandler(async (request: Request) => {
  const user = await getAuthUser();
  if (!user?.id) return errorResponse("Please sign in to continue", 401);
  const userId = user.id;

  let body: z.infer<typeof onboardingSchema>;
  try {
    body = onboardingSchema.parse(await request.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.errors[0];
      return errorResponse(first?.message || "Please check your answers and try again", 400);
    }
    return errorResponse("Something doesn't look right — please try again", 400);
  }

  // Idempotency: if user already has a company, reject the re-submit explicitly.
  // A silent 200 would make the user think their fresh inputs were accepted when
  // nothing actually changed. A 409 tells the client to redirect them home.
  const existingMembership = await getUserCompany(userId);
  if (existingMembership) {
    return NextResponse.json(
      {
        error: "Company already exists for this user",
        code: "ONBOARDING_ALREADY_COMPLETE",
        companyId: existingMembership.companyId,
        redirectTo: "/dashboard",
      },
      { status: 409 },
    );
  }

  const stage = parseStage(body.stage);
  const businessModel = parseBusinessModel(body.business_model);

  try {
    const result = await db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({
          name: body.company_name,
          stage,
          businessModel,
          industry: body.industry ?? null,
          ownerId: userId,
        })
        .returning();
      if (!company) throw new Error("Could not create your company — please try again");

      await tx.insert(companyMembers).values({
        companyId: company.id,
        userId,
        role: "owner",
      });

      if (body.user_name) {
        await tx
          .update(users)
          .set({ name: body.user_name })
          .where(eq(users.id, userId));
      }

      const [scenario] = await tx
        .insert(scenarios)
        .values({
          companyId: company.id,
          name: "Base Plan",
          source: "blank",
          description: `Initial financial model for ${body.company_name}`,
        })
        .returning();
      if (!scenario) throw new Error("Could not set up your financial model — please try again");

      await tx
        .insert(financialAccounts)
        .values(DEFAULT_ACCOUNTS.map((a) => ({ companyId: company.id, ...a })));

      await tx
        .insert(departments)
        .values(DEFAULT_DEPARTMENTS.map((name) => ({ companyId: company.id, name })));

      // AI features start disabled — user must opt in via Settings > AI Features.
      // This ensures no AI calls are made without explicit consent.
      await tx.insert(aiFeatureFlags).values({
        companyId: company.id,
        masterEnabled: false,
        dataMode: "full",
        features: {
          onboarding: true,
          chat: true,
          insights: true,
          uiPersonalization: true,
          autoCategorization: true,
          weeklyDigest: true,
        },
      });

      return { companyId: company.id, scenarioId: scenario.id };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong setting up your company";
    logger("onboarding").error("Error:", message);
    return errorResponse(message, 500);
  }
});
