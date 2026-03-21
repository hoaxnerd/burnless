/**
 * GET  /api/insights — Retrieve cached AI insights (works in show_cached mode).
 * POST /api/insights — Generate AI-powered insights for the current financial state.
 *
 * Supports page-specific insights via the `page` body parameter:
 *   - "dashboard" (default) — deterministic rule-based insights
 *   - "expenses" / "revenue" / "scenarios" — LLM-generated page insights (fast tier)
 *
 * POST caches results for later retrieval via GET.
 */

import { NextResponse } from "next/server";
import { db, scenarios as scenariosTable, aiInsightCache } from "@burnless/db";
import { eq, and } from "drizzle-orm";
import { generateInsights, generatePageInsights, type InsightPage } from "@burnless/ai";
import { requireCompanyAccess, errorResponse, withErrorHandler } from "@/lib/api-helpers";
import { checkAiFeatureAllowed, getAiFlags, getCompanyProviderConfig } from "@/lib/ai-feature-flags";
import { resolveFeatureStatus } from "@burnless/ai";
import { getDefaultScenario } from "@/lib/data";
import { buildAiContext } from "@/lib/build-ai-context";
import { logger } from "@/lib/logger";

const VALID_PAGES = ["dashboard", "expenses", "revenue", "scenarios"] as const;
type PageType = (typeof VALID_PAGES)[number];

// ── GET: serve cached insights ─────────────────────────────────────────────

export const GET = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  const flags = await getAiFlags(ctx.companyId);
  const status = resolveFeatureStatus(flags, "insights");

  if (!status.enabled && !status.showCached) {
    return NextResponse.json({ insights: [], reason: "AI insights are disabled" });
  }

  // Support page query param for cached retrieval
  const url = new URL(request.url);
  const page = (url.searchParams.get("page") ?? "dashboard") as PageType;

  const cacheType = page === "expenses" ? "expense" as const : page === "scenarios" ? "scenario" as const : page;

  const cached = await db
    .select()
    .from(aiInsightCache)
    .where(
      and(
        eq(aiInsightCache.companyId, ctx.companyId),
        eq(aiInsightCache.type, cacheType)
      )
    )
    .limit(1);

  if (!cached[0]) {
    return NextResponse.json({ insights: [], cached: true });
  }

  const cachedAt = cached[0].updatedAt;
  const ageMs = Date.now() - cachedAt.getTime();
  const stale = ageMs > 24 * 60 * 60 * 1000; // > 24h
  const expiresAt = cached[0].expiresAt;

  return NextResponse.json({
    insights: cached[0].content,
    cached: true,
    cachedAt,
    expiresAt,
    stale,
    ageMs,
    canRefresh: status.canGenerate,
  });
});

// ── POST: generate + cache insights ────────────────────────────────────────

export const POST = withErrorHandler(async (request: Request) => {
  const ctx = await requireCompanyAccess();
  if ("error" in ctx) return ctx.error;

  // Check AI feature flags — insights need LLM access
  const aiCheck = await checkAiFeatureAllowed(ctx.companyId, "insights");
  if (!aiCheck.allowed) {
    // If in show_cached mode, fall back to cached results
    const flags = await getAiFlags(ctx.companyId);
    const status = resolveFeatureStatus(flags, "insights");
    if (status.showCached) {
      return GET(request);
    }
    return NextResponse.json({ insights: [], reason: aiCheck.reason });
  }

  let scenarioId: string | undefined;
  let page: PageType = "dashboard";
  let pageData: Record<string, unknown> | undefined;

  try {
    const body = await request.json();
    scenarioId = body.scenarioId;
    if (body.page && VALID_PAGES.includes(body.page)) {
      page = body.page;
    }
    if (body.pageData && typeof body.pageData === "object") {
      pageData = body.pageData;
    }
  } catch {
    // No body is fine — use defaults
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

  // Route to appropriate insight generator
  let insights: unknown[];
  let cacheType: "dashboard" | "revenue" | "expense" | "scenario" | "general";

  if (page === "dashboard") {
    insights = generateInsights(snapshot);
    cacheType = "dashboard";
  } else {
    // LLM-powered page insights — wrapped in try/catch so failures return empty insights
    const pageKey = page as InsightPage;
    try {
      const companyProviderConfig = await getCompanyProviderConfig(ctx.companyId);
      insights = await generatePageInsights({
        page: pageKey,
        snapshot,
        pageData,
        providerConfig: companyProviderConfig,
      });
    } catch (err) {
      logger("insights").warn(
        `generatePageInsights failed for page="${page}":`,
        err instanceof Error ? err.message : err
      );
      insights = [];
    }
    cacheType = page === "expenses" ? "expense" : page === "scenarios" ? "scenario" : page;
  }

  // Cache the generated insights
  const cacheKey = `scenario:${scenario.id}`;
  await db
    .insert(aiInsightCache)
    .values({
      companyId: ctx.companyId,
      type: cacheType,
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
    page,
    scenario: {
      id: scenario.id,
      name: scenario.name,
    },
  });
});
