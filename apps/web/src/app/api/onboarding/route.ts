/**
 * POST /api/onboarding — Creates a company, base scenario, and initial
 * financial structure from the conversational onboarding data.
 *
 * Wrapped in a transaction so partial failures don't leave orphaned records.
 */

import { NextResponse } from "next/server";
import { db } from "@burnless/db";
import { logger } from "@/lib/logger";
import {
  companies,
  companyMembers,
  scenarios,
  financialAccounts,
  departments,
  revenueStreams,
  aiFeatureFlags,
} from "@burnless/db";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { getAuthUser, getUserCompany, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import {
  onboardingSchema,
  parseStage,
  parseBusinessModel,
  parseMoneyAmount,
} from "@/lib/onboarding-helpers";

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
    // Find their first scenario (overlay model has no "default" flag — just return the first)
    const [defaultScenario] = await db
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(
        and(
          eq(scenarios.companyId, existingMembership.companyId),
          isNull(scenarios.deletedAt)
        )
      )
      .limit(1);

    return NextResponse.json(
      {
        companyId: existingMembership.companyId,
        scenarioId: defaultScenario?.id ?? null,
        existing: true,
      },
      { status: 200 }
    );
  }

  const stage = parseStage(body.stage);
  const businessModel = parseBusinessModel(body.business_model);
  const monthlyRevenue = parseMoneyAmount(body.monthly_revenue ?? "0");

  try {
    const result = await db.transaction(async (tx) => {
      // Create company
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

      // Add user as owner
      await tx.insert(companyMembers).values({
        companyId: company.id,
        userId,
        role: "owner",
      });

      // Create initial scenario
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

      // Create default financial accounts
      const defaultAccounts = [
        { name: "Revenue", type: "income" as const, category: "revenue" as const, isSystem: true },
        { name: "Cost of Goods Sold", type: "expense" as const, category: "cogs" as const, isSystem: true },
        { name: "Salaries & Payroll", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
        { name: "Cloud Infrastructure", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
        { name: "Marketing", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
        { name: "Office & Admin", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
        { name: "Software & Tools", type: "expense" as const, category: "operating_expense" as const, isSystem: false },
        { name: "Cash & Bank", type: "asset" as const, category: "asset" as const, isSystem: true },
        { name: "Equity", type: "equity" as const, category: "equity" as const, isSystem: true },
      ];

      await tx
        .insert(financialAccounts)
        .values(
          defaultAccounts.map((a) => ({
            companyId: company.id,
            name: a.name,
            type: a.type,
            category: a.category,
            isSystem: a.isSystem,
          }))
        );

      // Create default departments
      const defaultDepts = ["Engineering", "Sales", "Marketing", "Operations", "General & Admin"];
      await tx.insert(departments).values(
        defaultDepts.map((name) => ({ companyId: company.id, name }))
      );

      // Create initial revenue stream if user has revenue
      if (monthlyRevenue > 0) {
        const revenueType = businessModel === "saas" ? "subscription" : businessModel === "services" ? "services" : "one_time";

        // Each revenue type has its own parameter shape expected by the engine
        let revenueParams: Record<string, number>;
        if (revenueType === "subscription") {
          revenueParams = { monthlyPrice: monthlyRevenue, startingCustomers: 1, newCustomersPerMonth: 5, monthlyChurnRate: 0.05 };
        } else if (revenueType === "services") {
          // Convert monthly revenue into hours * rate (assume $150/hr default)
          const hourlyRate = 150;
          revenueParams = { hoursPerMonth: Math.round(monthlyRevenue / hourlyRate), hourlyRate };
        } else {
          // one_time: convert to units * price (1 unit at full amount)
          revenueParams = { unitsPerMonth: 1, pricePerUnit: monthlyRevenue };
        }

        await tx.insert(revenueStreams).values({
          companyId: company.id,
          name: `${body.company_name} Revenue`,
          type: revenueType,
          parameters: revenueParams,
        });
      }

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

      // Note: We no longer auto-generate expense forecast lines during onboarding.
      // Users should add their real expenses explicitly via the expenses page.
      // This avoids showing placeholder/dummy data that confuses users.

      return { companyId: company.id, scenarioId: scenario.id };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong setting up your company";
    logger("onboarding").error("Error:", message);
    return errorResponse(message, 500);
  }
});
