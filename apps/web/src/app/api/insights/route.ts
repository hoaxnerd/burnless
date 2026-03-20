/**
 * GET  /api/insights — Retrieve cached AI insights (works in show_cached mode).
 * POST /api/insights — Generate AI-powered insights for the current financial state.
 *
 * POST caches results for later retrieval via GET.
 */

import { NextResponse } from "next/server";
import { db, scenarios as scenariosTable, aiInsightCache } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { generateInsights } from "@burnless/ai";
import { requireCompanyAccess, errorResponse } from "@/lib/api-helpers";
import { checkAiFeatureAllowed, getAiFlags } from "@/lib/ai-feature-flags";
import { resolveFeatureStatus } from "@burnless/ai";
import { getDefaultScenario } from "@/lib/data";
import { buildAiContext } from "@/lib/build-ai-context";

// ── GET: serve cached insights ─────────────────────────────────────────────

export async function GET() {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const flags = await getAiFlags(ctx.companyId);
  const status = resolveFeatureStatus(flags, "insights");

  if (!status.enabled && !status.showCached) {
    return NextResponse.json({ insights: [], reason: "AI insights are disabled" });
  }

  const cached = await db
    .select()
    .from(aiInsightCache)
    .where(
      and(
        eq(aiInsightCache.companyId, ctx.companyId),
        eq(aiInsightCache.type, "dashboard")
      )
    )
    .limit(1);

  if (!cached[0]) {
    return NextResponse.json({ insights: [], cached: true });
  }

  return NextResponse.json({
    insights: cached[0].content,
    cached: true,
    cachedAt: cached[0].updatedAt,
  });
}

// ── POST: generate + cache insights ────────────────────────────────────────

export async function POST(request: Request) {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Check AI feature flags — insights need LLM access
  const aiCheck = await checkAiFeatureAllowed(ctx.companyId, "insights");
  if (!aiCheck.allowed) {
    // If in show_cached mode, fall back to cached results
    const flags = await getAiFlags(ctx.companyId);
    const status = resolveFeatureStatus(flags, "insights");
    if (status.showCached) {
      return GET();
    }
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

  // Cache the generated insights for show_cached mode
  const cacheKey = `scenario:${scenario.id}`;
  await db
    .insert(aiInsightCache)
    .values({
      companyId: ctx.companyId,
      type: "dashboard",
      key: cacheKey,
      content: insights,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h TTL
    })
    .onConflictDoUpdate({
      target: [aiInsightCache.companyId, aiInsightCache.type, aiInsightCache.key],
      set: {
        content: insights,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

  return NextResponse.json({
    insights,
    scenario: {
      id: scenario.id,
      name: scenario.name,
    },
  });
}
