/**
 * POST /api/forecast-lines/bulk — bulk delete + bulk categorize.
 *
 * Body:
 *   { action: "delete", ids: string[] }
 *   { action: "categorize", ids: string[], accountId: string }
 *
 * Cross-company protection: every mutation is gated by a SELECT that
 * filters `companyId = ctx.companyId AND id IN (ids)`. Any id that does
 * not belong to the caller's company silently drops out of the matched
 * set — no 403, just count=0 for those.
 *
 * Scenario-aware: when a scenario cookie+header pair is active, every
 * mutation routes through `scenarioDelete` / `scenarioUpdate`, which
 * write to `scenario_overrides` instead of touching baseline rows.
 *
 * Categorize additionally validates the new accountId belongs to the
 * caller's company; foreign accountIds → 403 (no rows mutated).
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  db,
  forecastLines,
  financialAccounts,
  scenarioDelete,
  scenarioUpdate,
} from "@burnless/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  requireCompanyAccess,
  requireRole,
  errorResponse,
  withErrorHandler,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { trackDataMutation } from "@/lib/data-mutation-tracker";
import { getActiveScenario } from "@/lib/scenario-middleware";

const BulkBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().min(1)).min(1).max(500),
  }),
  z.object({
    action: z.literal("categorize"),
    ids: z.array(z.string().min(1)).min(1).max(500),
    accountId: z.string().min(1),
  }),
]);

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;

  const scenarioId = getActiveScenario(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = BulkBodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(parsed.error.message, 400);
  }
  const body = parsed.data;

  // For categorize, verify the destination accountId belongs to this company
  // BEFORE filtering forecast lines. Foreign account → 403.
  if (body.action === "categorize") {
    const accCheck = await db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.companyId, ctx.companyId),
          eq(financialAccounts.id, body.accountId),
        ),
      );
    if (accCheck.length === 0) {
      return errorResponse(
        "accountId does not belong to your company",
        403,
      );
    }
  }

  // Filter ids to those that actually belong to the caller's company.
  // Cross-company ids drop out here — no 403, no leak, just count=0.
  const matchedRows = await db
    .select({ id: forecastLines.id })
    .from(forecastLines)
    .where(
      and(
        eq(forecastLines.companyId, ctx.companyId),
        inArray(forecastLines.id, body.ids),
      ),
    );
  const matchedIds = matchedRows.map((r) => r.id);

  if (matchedIds.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  if (body.action === "delete") {
    for (const id of matchedIds) {
      await scenarioDelete("forecast_line", forecastLines, id, scenarioId, ctx.companyId);
      await logAudit(ctx, "forecast_line", id, "delete", {});
    }
  } else {
    // categorize
    for (const id of matchedIds) {
      const row = await scenarioUpdate(
        "forecast_line",
        forecastLines,
        id,
        { accountId: body.accountId },
        scenarioId,
        ctx.companyId,
      );
      await logAudit(ctx, "forecast_line", id, "update", { after: row });
    }
  }

  await trackDataMutation(ctx.companyId, "forecast-lines");
  revalidateTag("forecast-lines", { expire: 0 });
  revalidateTag("scenario-overrides", { expire: 0 }); // Phase 4 A §A1: keep overlay cache in sync
  revalidateTag("expense-details", { expire: 0 });
  revalidateTag("dashboard", { expire: 0 });

  return NextResponse.json({ ok: true, count: matchedIds.length });
});
