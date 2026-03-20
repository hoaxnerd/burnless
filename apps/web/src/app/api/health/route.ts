import { NextResponse } from "next/server";
import { db } from "@burnless/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/health
 *
 * Health check endpoint for uptime monitoring.
 * Checks database connectivity and returns system status.
 * No authentication required — monitoring services need unrestricted access.
 */
export async function GET() {
  const start = Date.now();

  let dbStatus: "connected" | "error" = "error";
  let dbLatencyMs: number | null = null;

  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "connected" ? "ok" : "degraded";
  const httpStatus = status === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: dbStatus,
      dbLatencyMs,
      responseMs: Date.now() - start,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    },
    { status: httpStatus }
  );
}
