/**
 * POST /api/insights/batch-regenerate — batch insight regeneration.
 *
 * As of S3a the scheduling runs through the scheduler core
 * (/api/cron/run-scheduled-jobs, every 5 min); this route remains for manual /
 * back-compat invocation and delegates to runBatchRegenerate().
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-helpers";
import { runBatchRegenerate } from "@/lib/cron/batch-regenerate";

const CRON_SECRET = process.env.CRON_SECRET;
const SKIP_CRON_AUTH = process.env.DISABLE_CRON_AUTH === "true";
const log = logger("batch-regenerate");

export const POST = withErrorHandler(async function POST(request: Request) {
  if (!SKIP_CRON_AUTH) {
    if (!CRON_SECRET) {
      log.error("CRON_SECRET is not configured");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.json(await runBatchRegenerate());
});
