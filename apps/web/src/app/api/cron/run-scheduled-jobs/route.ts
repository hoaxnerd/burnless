// apps/web/src/app/api/cron/run-scheduled-jobs/route.ts
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-helpers";
import { runDueJobs } from "@/lib/scheduler/core";

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
