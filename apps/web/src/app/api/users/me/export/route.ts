import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  db,
  users,
  companies,
  companyMembers,
  financialAccounts,
  transactions,
  scenarios,
  forecastLines,
  forecastValues,
  departments,
  headcountPlans,
  revenueStreams,
  fundingRounds,
  metrics,
  integrations,
  importBatches,
  aiFeatureFlags,
  aiConversations,
  aiMessages,
  aiInsightCache,
} from "@burnless/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { getAuthUser, errorResponse, withErrorHandler } from "@/lib/api-helpers";

/**
 * GET /api/users/me/export
 *
 * GDPR "Right to Data Portability" — exports all user data as JSON.
 * Returns a comprehensive snapshot of everything stored about this user.
 */
export const GET = withErrorHandler(async () => {
  const user = await getAuthUser();
  if (!user?.id) return errorResponse("Unauthorized", 401);

  const userId = user.id;

  try {
    // Fetch user profile
    const [profile] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        image: users.image,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!profile) return errorResponse("User not found", 404);

    // Fetch memberships
    const memberships = await db
      .select()
      .from(companyMembers)
      .where(eq(companyMembers.userId, userId));

    const companyIds = memberships.map((m) => m.companyId);

    // If user has no companies, return minimal export
    if (companyIds.length === 0) {
      return buildExportResponse({
        exportedAt: new Date().toISOString(),
        user: profile,
        memberships: [],
        companies: [],
        aiConversations: [],
      });
    }

    // Batch 1: Fetch company-level data in parallel
    const [
      companiesData,
      financialAccountsData,
      transactionsData,
      scenariosData,
      departmentsData,
      fundingRoundsData,
      metricsData,
      integrationsData,
      importBatchesData,
      aiFeatureFlagsData,
      aiConversationsData,
      aiInsightCacheData,
    ] = await Promise.all([
      db.select().from(companies).where(inArray(companies.id, companyIds)),
      db
        .select()
        .from(financialAccounts)
        .where(inArray(financialAccounts.companyId, companyIds)),
      db
        .select()
        .from(transactions)
        .where(inArray(transactions.companyId, companyIds)),
      db
        .select()
        .from(scenarios)
        .where(and(inArray(scenarios.companyId, companyIds), isNull(scenarios.deletedAt))),
      db
        .select()
        .from(departments)
        .where(inArray(departments.companyId, companyIds)),
      db
        .select()
        .from(fundingRounds)
        .where(inArray(fundingRounds.companyId, companyIds)),
      db.select().from(metrics).where(inArray(metrics.companyId, companyIds)),
      db
        .select()
        .from(integrations)
        .where(inArray(integrations.companyId, companyIds)),
      db
        .select()
        .from(importBatches)
        .where(inArray(importBatches.companyId, companyIds)),
      db
        .select()
        .from(aiFeatureFlags)
        .where(inArray(aiFeatureFlags.companyId, companyIds)),
      db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.userId, userId)),
      db
        .select()
        .from(aiInsightCache)
        .where(inArray(aiInsightCache.companyId, companyIds)),
    ]);

    // Batch 2: Fetch company-scoped entity data and conversation-level nested data
    const conversationIds = aiConversationsData.map((c) => c.id);

    const [
      forecastLinesData,
      headcountPlansData,
      revenueStreamsData,
      aiMessagesData,
    ] = await Promise.all([
      companyIds.length > 0
        ? db
            .select()
            .from(forecastLines)
            .where(inArray(forecastLines.companyId, companyIds))
        : Promise.resolve([]),
      companyIds.length > 0
        ? db
            .select()
            .from(headcountPlans)
            .where(inArray(headcountPlans.companyId, companyIds))
        : Promise.resolve([]),
      companyIds.length > 0
        ? db
            .select()
            .from(revenueStreams)
            .where(inArray(revenueStreams.companyId, companyIds))
        : Promise.resolve([]),
      conversationIds.length > 0
        ? db
            .select()
            .from(aiMessages)
            .where(inArray(aiMessages.conversationId, conversationIds))
        : Promise.resolve([]),
    ]);

    // Batch 3: Fetch forecast values (depends on forecastLines)
    const forecastLineIds = forecastLinesData.map((fl) => fl.id);
    const forecastValuesData =
      forecastLineIds.length > 0
        ? await db
            .select()
            .from(forecastValues)
            .where(inArray(forecastValues.forecastLineId, forecastLineIds))
        : [];

    // Build structured export grouped by company
    const companyExports = companiesData.map((company) => ({
      ...company,
      financialAccounts: financialAccountsData.filter(
        (a) => a.companyId === company.id
      ),
      transactions: transactionsData.filter(
        (t) => t.companyId === company.id
      ),
      scenarios: scenariosData.filter((s) => s.companyId === company.id),
      forecastLines: forecastLinesData
        .filter((fl) => fl.companyId === company.id)
        .map((fl) => ({
          ...fl,
          values: forecastValuesData.filter(
            (fv) => fv.forecastLineId === fl.id
          ),
        })),
      headcountPlans: headcountPlansData.filter(
        (hp) => hp.companyId === company.id
      ),
      revenueStreams: revenueStreamsData.filter(
        (rs) => rs.companyId === company.id
      ),
      departments: departmentsData.filter(
        (d) => d.companyId === company.id
      ),
      fundingRounds: fundingRoundsData.filter(
        (f) => f.companyId === company.id
      ),
      metrics: metricsData.filter((m) => m.companyId === company.id),
      integrations: integrationsData.filter(
        (i) => i.companyId === company.id
      ),
      importBatches: importBatchesData.filter(
        (ib) => ib.companyId === company.id
      ),
      aiFeatureFlags: aiFeatureFlagsData.filter(
        (af) => af.companyId === company.id
      ),
      aiInsightCache: aiInsightCacheData.filter(
        (aic) => aic.companyId === company.id
      ),
    }));

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: profile,
      memberships,
      companies: companyExports,
      aiConversations: aiConversationsData.map((conv) => ({
        ...conv,
        messages: aiMessagesData.filter(
          (m) => m.conversationId === conv.id
        ),
      })),
    };

    return buildExportResponse(exportData);
  } catch (error) {
    logger("export").error("User data export failed:", error);
    return errorResponse("Failed to export user data. Please try again.", 500);
  }
});

function buildExportResponse(data: unknown) {
  const json = JSON.stringify(data, null, 2);
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="burnless-data-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
