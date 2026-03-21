import { NextResponse } from "next/server";
import { db, privacyConsents } from "@burnless/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getAuthUser, errorResponse, parseBody, withErrorHandler } from "@/lib/api-helpers";
import { z } from "zod";

const VALID_PURPOSES = [
  "data_processing",
  "ai_features",
  "marketing",
  "analytics",
] as const;

const consentSchema = z.object({
  purpose: z.enum(VALID_PURPOSES),
  granted: z.boolean(),
});

/**
 * GET /api/users/me/consent
 *
 * Returns current consent status for all purposes.
 */
export const GET = withErrorHandler(async (_request: Request) => {
  const user = await getAuthUser();
  if (!user?.id) return errorResponse("Unauthorized", 401);

  const consents = await db
    .select()
    .from(privacyConsents)
    .where(
      and(
        eq(privacyConsents.userId, user.id),
        isNull(privacyConsents.revokedAt)
      )
    )
    .orderBy(desc(privacyConsents.grantedAt));

  // Deduplicate: keep latest consent per purpose
  const latestByPurpose = new Map<string, typeof consents[0]>();
  for (const consent of consents) {
    if (!latestByPurpose.has(consent.purpose)) {
      latestByPurpose.set(consent.purpose, consent);
    }
  }

  // Build status map for all purposes
  const status = VALID_PURPOSES.map((purpose) => {
    const consent = latestByPurpose.get(purpose);
    return {
      purpose,
      granted: consent?.granted ?? false,
      grantedAt: consent?.grantedAt ?? null,
    };
  });

  return NextResponse.json({ consents: status });
});

/**
 * POST /api/users/me/consent
 *
 * Record a consent decision. Creates an immutable audit log entry.
 * Previous consents for the same purpose are marked as revoked.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const user = await getAuthUser();
  if (!user?.id) return errorResponse("Unauthorized", 401);

  const parsed = await parseBody(request, consentSchema);
  if ("error" in parsed) return parsed.error;

  const { purpose, granted } = parsed.data;
  const now = new Date();

  await db.transaction(async (tx) => {
    // Revoke any existing active consent for this purpose
    const existing = await tx
      .select({ id: privacyConsents.id })
      .from(privacyConsents)
      .where(
        and(
          eq(privacyConsents.userId, user.id!),
          eq(privacyConsents.purpose, purpose),
          isNull(privacyConsents.revokedAt)
        )
      );

    if (existing.length > 0) {
      for (const record of existing) {
        await tx
          .update(privacyConsents)
          .set({ revokedAt: now })
          .where(eq(privacyConsents.id, record.id));
      }
    }

    // Insert new consent record (immutable audit trail)
    await tx.insert(privacyConsents).values({
      userId: user.id!,
      purpose,
      granted,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
      grantedAt: now,
    });
  });

  return NextResponse.json({
    purpose,
    granted,
    recordedAt: now.toISOString(),
  });
});
