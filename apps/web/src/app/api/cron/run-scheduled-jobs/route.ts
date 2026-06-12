// apps/web/src/app/api/cron/run-scheduled-jobs/route.ts
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-helpers";
import { runDueJobs } from "@/lib/scheduler/core";

const CRON_SECRET = process.env.CRON_SECRET;
const SKIP_CRON_AUTH = process.env.DISABLE_CRON_AUTH === "true";

/**
 * The external scheduler driver (cloud / Docker). Hit every minute by
 * scripts/cron-worker.ts (or Vercel Cron). Runs the same core the in-process
 * timer runs on self_host. CRON_SECRET-gated like the other cron routes.
 */
export const GET = withErrorHandler(async function GET(request: Request) {
  const skip = process.env.DISABLE_CRON_AUTH === "true";
  if (!skip) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      logger("cron").error("CRON_SECRET is not configured");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const outcome = await runDueJobs(new Date());
  return NextResponse.json(outcome);
});

// Note: read CRON_SECRET/DISABLE_CRON_AUTH from process.env at call time (above)
// so tests can set them per-case; the module-scope consts are unused here.
void CRON_SECRET; void SKIP_CRON_AUTH;
