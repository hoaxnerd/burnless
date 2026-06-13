/**
 * POST /api/onboarding — CREATE-OR-CLAIM.
 *
 * Two paths, decided server-side so the client (CompanyStep) stays dumb:
 *
 * 1. CLAIM (self-host): boot auto-creates an install-time placeholder company
 *    (id = LOCAL_OWNER_COMPANY_ID, name "My Company") + owner membership so the
 *    encrypted per-company AI-provider path works from first boot. The wizard's
 *    company step CLAIMS that row: it UPDATEs only the user-provided non-empty
 *    fields (non-destructive) and CREATE-IF-ABSENT the scaffolding boot did NOT
 *    create (base scenario, default accounts/departments, aiFeatureFlags). The
 *    base scenario doubles as the "claimed" sentinel — boot never makes one, so
 *    its absence on the install company means "still unclaimed".
 *
 * 2. CREATE (cloud / no membership): the legacy path — insert a fresh company +
 *    owner membership + all scaffolding in one transaction.
 *
 * Both return 201 `{ companyId, scenarioId }`. An already-CLAIMED company (cloud
 * re-submit, or self-host re-submit after claim) returns 409 with the companyId.
 *
 * Wrapped in a transaction so partial failures don't leave orphaned records.
 *
 * Detailed entities (revenue streams, funding rounds, headcount, expenses) are
 * NO LONGER created here. The S4b onboarding wizard creates/claims the company
 * first (via this route), then drives the REAL per-domain endpoints for each
 * detail. If a body still carries those arrays they are silently ignored.
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
  LOCAL_OWNER_COMPANY_ID,
} from "@burnless/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getAuthUser, getUserCompany, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { initialAiMasterEnabled } from "@/lib/ai-default";
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

  const stage = parseStage(body.stage);
  const businessModel = parseBusinessModel(body.business_model);

  const existingMembership = await getUserCompany(userId);

  // ── CLAIM path (self-host install company) ────────────────────────────
  // The user already has the install-time placeholder company. If it is still
  // unclaimed (no base scenario yet — boot never creates one), CLAIM it: update
  // only the user-provided fields + create-if-absent the scaffolding. Otherwise
  // it is already claimed → 409.
  if (existingMembership) {
    if (existingMembership.companyId === LOCAL_OWNER_COMPANY_ID) {
      const claimed = await isCompanyClaimed(LOCAL_OWNER_COMPANY_ID);
      if (!claimed) {
        try {
          const result = await claimInstallCompany({
            userId,
            companyName: body.company_name,
            stage,
            businessModel,
            industry: body.industry,
            userName: body.user_name,
          });
          return NextResponse.json(result, { status: 201 });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Something went wrong setting up your company";
          logger("onboarding").error("Claim error:", message);
          return errorResponse(message, 500);
        }
      }
    }

    // Already-claimed (cloud re-submit OR self-host re-claim): reject the
    // re-submit explicitly. A silent 200 would make the user think their fresh
    // inputs were accepted when nothing changed. A 409 tells the client to
    // redirect them home.
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

  // ── CREATE path (cloud / no membership) ───────────────────────────────
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

      await tx.insert(aiFeatureFlags).values(buildAiFeatureFlagsRow(company.id));

      return { companyId: company.id, scenarioId: scenario.id };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong setting up your company";
    logger("onboarding").error("Error:", message);
    return errorResponse(message, 500);
  }
});

/**
 * The install company is "claimed" once a base scenario exists for it. Boot
 * (`createOwnerCompanyIfNone`) creates ONLY the company + membership — never a
 * scenario — so the scenario's presence is a robust claim sentinel (robust even
 * if the user legitimately names their company "My Company").
 */
async function isCompanyClaimed(companyId: string): Promise<boolean> {
  const [scenario] = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(eq(scenarios.companyId, companyId))
    .limit(1);
  return scenario != null;
}

/**
 * CLAIM the install-time placeholder company: non-destructive UPDATE of the
 * company row (only user-provided fields) + CREATE-IF-ABSENT scaffolding. Each
 * insert is guarded by an existence check so a re-claim (race / retry) is
 * idempotent. Wrapped in one transaction.
 */
async function claimInstallCompany(input: {
  userId: string;
  companyName: string;
  stage: ReturnType<typeof parseStage>;
  businessModel: ReturnType<typeof parseBusinessModel>;
  industry?: string;
  userName?: string;
}): Promise<{ companyId: string; scenarioId: string }> {
  const companyId = LOCAL_OWNER_COMPANY_ID;
  return db.transaction(async (tx) => {
    // Non-destructive: only SET fields the user provided. company_name is
    // required (non-empty) and stage/businessModel always carry a form default;
    // industry/user_name are only set when present (never null an existing value).
    const companyUpdate: {
      name: string;
      stage: ReturnType<typeof parseStage>;
      businessModel: ReturnType<typeof parseBusinessModel>;
      industry?: string;
    } = {
      name: input.companyName,
      stage: input.stage,
      businessModel: input.businessModel,
    };
    if (input.industry) companyUpdate.industry = input.industry;
    await tx.update(companies).set(companyUpdate).where(eq(companies.id, companyId));

    if (input.userName) {
      await tx.update(users).set({ name: input.userName }).where(eq(users.id, input.userId));
    }

    // Base scenario — create-if-absent (the claim sentinel).
    const [existingScenario] = await tx
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(eq(scenarios.companyId, companyId))
      .limit(1);
    let scenarioId = existingScenario?.id;
    if (!scenarioId) {
      const [scenario] = await tx
        .insert(scenarios)
        .values({
          companyId,
          name: "Base Plan",
          source: "blank",
          description: `Initial financial model for ${input.companyName}`,
        })
        .returning();
      if (!scenario) throw new Error("Could not set up your financial model — please try again");
      scenarioId = scenario.id;
    }

    // Default accounts — create-if-absent.
    const [existingAccount] = await tx
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(eq(financialAccounts.companyId, companyId))
      .limit(1);
    if (!existingAccount) {
      await tx
        .insert(financialAccounts)
        .values(DEFAULT_ACCOUNTS.map((a) => ({ companyId, ...a })));
    }

    // Default departments — create-if-absent.
    const [existingDept] = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.companyId, companyId))
      .limit(1);
    if (!existingDept) {
      await tx
        .insert(departments)
        .values(DEFAULT_DEPARTMENTS.map((name) => ({ companyId, name })));
    }

    // aiFeatureFlags — create-if-absent.
    const [existingFlags] = await tx
      .select({ companyId: aiFeatureFlags.companyId })
      .from(aiFeatureFlags)
      .where(eq(aiFeatureFlags.companyId, companyId))
      .limit(1);
    if (!existingFlags) {
      await tx.insert(aiFeatureFlags).values(buildAiFeatureFlagsRow(companyId));
    }

    return { companyId, scenarioId };
  });
}

/**
 * AI on by default at company creation (#34). Degrades gracefully when no
 * provider key is set; never persist a false merely for a missing key.
 */
function buildAiFeatureFlagsRow(companyId: string) {
  return {
    companyId,
    masterEnabled: initialAiMasterEnabled(),
    dataMode: "full" as const,
    features: {
      onboarding: true,
      chat: true,
      insights: true,
      uiPersonalization: true,
      autoCategorization: true,
      weeklyDigest: true,
    },
  };
}
