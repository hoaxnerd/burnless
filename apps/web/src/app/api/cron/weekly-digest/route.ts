/**
 * Vercel Cron endpoint — generates Monday Morning CFO digests for all active companies.
 * Schedule: every Monday at 8:00 UTC. As of S3a the actual scheduling runs through
 * the scheduler core (/api/cron/run-scheduled-jobs); this route remains for manual /
 * back-compat invocation and simply delegates to runWeeklyDigest().
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-helpers";
import { runWeeklyDigest } from "@/lib/cron/weekly-digest";

const CRON_SECRET = process.env.CRON_SECRET;
const SKIP_CRON_AUTH = process.env.DISABLE_CRON_AUTH === "true";

export const GET = withErrorHandler(async function GET(request: Request) {
  if (!SKIP_CRON_AUTH) {
    if (!CRON_SECRET) {
      logger("cron").error("CRON_SECRET is not configured");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.json(await runWeeklyDigest());
});
