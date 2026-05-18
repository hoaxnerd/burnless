import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db, fundingRounds, scenarioUpdate } from "@burnless/db";
import { and, eq } from "drizzle-orm";
import {
  requireCompanyAccess,
  requireRole,
  parseBody,
  errorResponse,
  withErrorHandler,
} from "@/lib/api-helpers";
import { getActiveScenario } from "@/lib/scenario-middleware";
import { logAudit } from "@/lib/audit";

const PatchBody = z.object({
  hitDate: z.string().nullable(),
}).strict();

interface Milestone {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  hitDate?: string;
}

export const PATCH = withErrorHandler(async (
  request: Request,
  context: { params: Promise<{ id: string; milestoneId: string }> },
) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const roleErr = requireRole(ctx, "editor");
  if (roleErr) return roleErr;
  const { id, milestoneId } = await context.params;
  const scenarioId = getActiveScenario(request);
  const parsed = await parseBody(request, PatchBody);
  if ("error" in parsed) return parsed.error;

  const [round] = await db
    .select()
    .from(fundingRounds)
    .where(and(eq(fundingRounds.id, id), eq(fundingRounds.companyId, ctx.companyId)));
  if (!round) return errorResponse("Round not found", 404);
  if (round.type !== "grant") return errorResponse("Not a grant round", 400);

  const params_ = (round.parameters ?? {}) as { milestones?: Milestone[] };
  const milestonesArr = params_.milestones ?? [];
  if (!milestonesArr.some((m) => m.id === milestoneId)) {
    return errorResponse("Milestone not found", 404);
  }
  const updated = milestonesArr.map((m) =>
    m.id === milestoneId ? { ...m, hitDate: parsed.data.hitDate ?? undefined } : m,
  );
  await scenarioUpdate(
    "funding_round",
    fundingRounds,
    id,
    { parameters: { ...params_, milestones: updated } },
    scenarioId,
  );
  await logAudit(ctx, "funding_round", id, "update", { after: { milestoneId, hitDate: parsed.data.hitDate } });
  revalidateTag("funding-rounds");
  revalidateTag("cap-table");
  return NextResponse.json({ milestone: updated.find((m) => m.id === milestoneId) });
});
