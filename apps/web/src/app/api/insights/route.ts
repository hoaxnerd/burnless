/**
 * POST /api/insights — Generate AI-powered insights for the current financial state.
 * Returns proactive alerts, variance analysis, and recommendations.
 */

import { NextResponse } from "next/server";
import { db, scenarios as scenariosTable } from "@burnless/db";
import { eq } from "drizzle-orm";
import { generateInsights } from "@burnless/ai";
import { requireCompanyAccess, errorResponse } from "@/lib/api-helpers";
import { checkAiFeatureAllowed } from "@/lib/ai-feature-flags";
import { getDefaultScenario } from "@/lib/data";
import { buildAiContext } from "@/lib/build-ai-context";

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Check AI feature flags — insights need LLM access
  const aiCheck = await checkAiFeatureAllowed(ctx.companyId, "insights");
  if (!aiCheck.allowed) {
    return NextResponse.json({ insights: [], reason: aiCheck.reason });
  }

  let scenarioId: string | undefined;
  try {
    const body = await request.json();
    scenarioId = body.scenarioId;
  } catch {
    // No body is fine — use default scenario
  }

  let scenario;
  if (scenarioId) {
    const [found] = await db.select().from(scenariosTable).where(eq(scenariosTable.id, scenarioId));
    scenario = found ?? await getDefaultScenario(ctx.companyId);
  } else {
    scenario = await getDefaultScenario(ctx.companyId);
  }

  if (!scenario) {
    return errorResponse("No scenario found", 404);
  }

  const { snapshot } = await buildAiContext(ctx.companyId, {
    id: scenario.id,
    name: scenario.name,
    type: scenario.type,
  });

  const insights = generateInsights(snapshot);

  return NextResponse.json({
    insights,
    scenario: {
      id: scenario.id,
      name: scenario.name,
    },
  });
}
