/**
 * Vercel Cron endpoint — purges expired AI conversations and stale insight cache.
 * Schedule: Daily at 3:00 UTC (configured in vercel.json).
 *
 * Retention policies:
 *   AI conversations: 90 days
 *   AI insight cache: respects expiresAt field
 */

import { NextResponse } from "next/server";
import { cleanupExpiredData } from "@/lib/data-retention";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-helpers";

const CRON_SECRET = process.env.CRON_SECRET;
const SKIP_CRON_AUTH = process.env.DISABLE_CRON_AUTH === "true";

export const GET = withErrorHandler(async function GET(request: Request) {
  if (!SKIP_CRON_AUTH) {
    if (!CRON_SECRET) {
      logger("cron").error("CRON_SECRET is not configured");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await cleanupExpiredData();
  logger("cron").info(
    `Data retention cleanup: ${result.conversationsDeleted} conversations, ${result.cacheDeleted} cache entries purged`
  );

  return NextResponse.json({ ok: true, ...result });
});
