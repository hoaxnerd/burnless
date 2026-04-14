/**
 * GET  /api/exports — Get monthly export count and remaining allowance.
 * POST /api/exports — Record an export and check plan limits.
 *
 * Exports happen client-side (PDF/CSV generation). The client calls POST
 * before starting an export to check the limit and record usage.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db, exportLogs } from "@burnless/db";
import { eq, and, gte, count } from "drizzle-orm";
import { requireCompanyAccess, getCompanyPlan, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { canPerformAction } from "@/lib/feature-gate";
import { getPlanLimits } from "@burnless/ai";

function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function getMonthlyExportCount(companyId: string) {
  const rows = await db
    .select({ cnt: count() })
    .from(exportLogs)
    .where(
      and(
        eq(exportLogs.companyId, companyId),
        gte(exportLogs.createdAt, getMonthStart())
      )
    );
  return rows[0]?.cnt ?? 0;
}

// ── GET ─────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async () => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const plan = await getCompanyPlan(ctx.companyId);
  const limits = getPlanLimits(plan);
  const used = await getMonthlyExportCount(ctx.companyId);

  return NextResponse.json({
    used,
    limit: limits.maxExports === Infinity ? -1 : limits.maxExports,
    remaining: limits.maxExports === Infinity ? -1 : Math.max(0, limits.maxExports - used),
  });
});

// ── POST ────────────────────────────────────────────────────────────────────

const postSchema = z.object({
  exportType: z.string().min(1).max(100),
  format: z.enum(["pdf", "csv"]),
});

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return errorResponse("Invalid request body", 400);
  }

  // Check export limit
  const plan = await getCompanyPlan(ctx.companyId);
  const used = await getMonthlyExportCount(ctx.companyId);
  const gate = canPerformAction(plan, "export", used);
  if (!gate.allowed) {
    return errorResponse(gate.reason!, 403);
  }

  // Record the export
  await db.insert(exportLogs).values({
    companyId: ctx.companyId,
    userId: ctx.userId,
    exportType: body.exportType,
    format: body.format,
  });

  const limits = getPlanLimits(plan);
  return NextResponse.json({
    used: used + 1,
    limit: limits.maxExports === Infinity ? -1 : limits.maxExports,
    remaining: limits.maxExports === Infinity ? -1 : Math.max(0, limits.maxExports - (used + 1)),
  });
});
