/**
 * POST /api/onboarding — Creates a company, base scenario, and initial
 * financial structure from the conversational onboarding data.
 *
 * Wrapped in a transaction so partial failures don't leave orphaned records.
 *
 * Note on AI-suggested data: the request body MAY include `funding_rounds`,
 * `headcount`, `expenses`, and `revenue_streams` from the AI research agent.
 * These are inserted verbatim because the user has just reviewed and selected
 * them in the Review step. We do NOT auto-extrapolate any of these (no growth
 * curves, no churn assumptions) — anything that ships here is something the
 * user opted into. The bulk-insert logic lives in `lib/onboarding-imports.ts`.
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
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getAuthUser, getUserCompany, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import {
  onboardingSchema,
  parseStage,
  parseBusinessModel,
} from "@/lib/onboarding-helpers";
import { applyOnboardingSuggestions } from "@/lib/onboarding-imports";

const DEFAULT_ACCOUNTS = [
  { name: "Revenue", type: "income", category: "revenue", isSystem: true },
  { name: "Cost of Goods Sold", type: "expense", category: "cogs", isSystem: true },
  { name: "Salaries & Payroll", type: "expense", category: "operating_expense", isSystem: false },
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

  // Idempotency: if user already has a company, return it instead of creating a duplicate
  const existingMembership = await getUserCompany(userId);
  if (existingMembership) {
    const [defaultScenario] = await db
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(
        and(
          eq(scenarios.companyId, existingMembership.companyId),
          isNull(scenarios.deletedAt),
        ),
      )
      .limit(1);

    return NextResponse.json(
      {
        companyId: existingMembership.companyId,
        scenarioId: defaultScenario?.id ?? null,
        existing: true,
      },
      { status: 200 },
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

      const insertedAccounts = await tx
        .insert(financialAccounts)
        .values(DEFAULT_ACCOUNTS.map((a) => ({ companyId: company.id, ...a })))
        .returning();
      const accountMap = new Map(insertedAccounts.map((a) => [a.name, a.id]));

      const insertedDepts = await tx
        .insert(departments)
        .values(DEFAULT_DEPARTMENTS.map((name) => ({ companyId: company.id, name })))
        .returning();
      const deptMap = new Map(insertedDepts.map((d) => [d.name, d.id]));

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

      // User-reviewed AI suggestions — only what they checked in the Review step.
      await applyOnboardingSuggestions(
        { tx, companyId: company.id, accountMap, deptMap },
        body,
      );

      return { companyId: company.id, scenarioId: scenario.id };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong setting up your company";
    logger("onboarding").error("Error:", message);
    return errorResponse(message, 500);
  }
});
