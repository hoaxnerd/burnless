import { NextResponse } from "next/server";
import { db, users, companies } from "@burnless/db";
import { eq } from "drizzle-orm";
import { getAuthUser, errorResponse, withErrorHandler } from "@/lib/api-helpers";

/**
 * DELETE /api/users/me
 *
 * GDPR "Right to Erasure" — permanently deletes the authenticated user
 * and all associated data. This action is irreversible.
 *
 * Cascade chain:
 *   1. Delete all companies owned by user (each cascades to all child data)
 *   2. Delete the user record (cascades to accounts, sessions, companyMembers, aiConversations)
 */
export const DELETE = withErrorHandler(async (request: Request) => {
  const user = await getAuthUser();
  if (!user?.id) return errorResponse("Unauthorized", 401);

  // Require confirmation header to prevent accidental deletion
  const confirmation = request.headers.get("x-confirm-delete");
  if (confirmation !== "permanently-delete-all-my-data") {
    return errorResponse(
      "Missing confirmation header: x-confirm-delete: permanently-delete-all-my-data",
      400
    );
  }

  const userId = user.id;

  try {
    await db.transaction(async (tx) => {
      // Step 1: Delete all companies owned by this user.
      // Company cascades handle: financialAccounts, transactions, scenarios,
      // forecastLines, forecastValues, departments, headcountPlans, revenueStreams,
      // fundingRounds, metrics, integrations, importBatches, aiFeatureFlags,
      // aiConversations, aiMessages, aiInsightCache, companyMembers
      await tx.delete(companies).where(eq(companies.ownerId, userId));

      // Step 2: Delete the user record.
      // User cascades handle: accounts (OAuth), sessions, companyMembers (non-owned),
      // aiConversations (user-level FK)
      await tx.delete(users).where(eq(users.id, userId));
    });

    return NextResponse.json({
      success: true,
      message: "All user data has been permanently deleted.",
    });
  } catch (error) {
    console.error("User deletion failed:", error);
    return errorResponse("Failed to delete user data. Please try again.", 500);
  }
});
