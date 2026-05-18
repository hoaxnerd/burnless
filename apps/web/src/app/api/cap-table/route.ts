import { NextResponse } from "next/server";
import { requireCompanyAccess, withErrorHandler } from "@/lib/api-helpers";
import { getActiveScenario } from "@/lib/scenario-middleware";
import { computeCapTableForCompany } from "@/lib/compute-cap-table";

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;
  const scenarioId = getActiveScenario(request);
  const capTable = await computeCapTableForCompany(ctx.companyId, scenarioId);
  return NextResponse.json({ capTable });
});
