/**
 * POST /api/insights/batch-regenerate — Cron-triggered batch insight regeneration.
 *
 * Checks the insight_invalidations table for entries where:
 *   - processedAt IS NULL (pending)
 *   - lastMutationAt + GRACE_PERIOD_MS < now (grace period elapsed)
 *
 * Groups by company, regenerates all stale insight types in parallel,
 * updates the cache, logs usage, and marks invalidations as processed.
 *
 * Schedule: Every 5 minutes (configured in vercel.json).
 * Can also be called manually for testing.
 */

import { NextResponse } from "next/server";
import {
  db,
  insightInvalidations,
  aiInsightCache,
  scenarios as scenariosTable,
} from "@burnless/db";
import { eq, isNull, lte, and } from "drizzle-orm";
import {
  generateInsights,
  generatePageInsights,
  type InsightPage,
} from "@burnless/ai";
import { buildAiContext } from "@/lib/build-ai-context";
import { checkAiFeatureAllowed, getCompanyProviderConfig } from "@/lib/ai-feature-flags";
import { getDefaultScenario } from "@/lib/data";
import { logger } from "@/lib/logger";

const log = logger("batch-regenerate");

const CRON_SECRET = process.env.CRON_SECRET;
const IS_DEV = process.env.NODE_ENV === "development";

/** Grace period: wait 5 minutes after the last mutation before regenerating. */
const GRACE_PERIOD_MS = 5 * 60 * 1000;

/** Maps insight type back to the page name used by generatePageInsights. */
const INSIGHT_TYPE_TO_PAGE: Record<string, InsightPage | "dashboard"> = {
  expense: "expenses",
  revenue: "revenue",
  scenario: "scenarios",
  dashboard: "dashboard",
};

/** Maps insight type to cache type enum values. */
const INSIGHT_TYPE_TO_CACHE_TYPE: Record<
  string,
  "dashboard" | "revenue" | "expense" | "scenario" | "general"
> = {
  expense: "expense",
  revenue: "revenue",
  scenario: "scenario",
  dashboard: "dashboard",
};

interface RegenerationResult {
  companyId: string;
  insightType: string;
  status: "regenerated" | "skipped" | "error";
  reason?: string;
}

export async function POST(request: Request) {
  // Auth: Vercel Cron secret or dev mode
  if (!IS_DEV) {
    if (!CRON_SECRET) {
      log.error("CRON_SECRET is not configured");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const graceCutoff = new Date(Date.now() - GRACE_PERIOD_MS);

  // Fetch all pending invalidations whose grace period has elapsed
  const pending = await db
    .select()
    .from(insightInvalidations)
    .where(
      and(
        isNull(insightInvalidations.processedAt),
        lte(insightInvalidations.lastMutationAt, graceCutoff)
      )
    );

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [] });
  }

  log.info({ count: pending.length }, "Processing pending insight invalidations");

  // Group by company
  const byCompany = new Map<string, typeof pending>();
  for (const inv of pending) {
    const list = byCompany.get(inv.companyId) ?? [];
    list.push(inv);
    byCompany.set(inv.companyId, list);
  }

  const results: RegenerationResult[] = [];

  for (const [companyId, invalidations] of byCompany) {
    // Check if AI insights are allowed for this company
    const aiCheck = await checkAiFeatureAllowed(companyId, "insights");
    if (!aiCheck.allowed) {
      for (const inv of invalidations) {
        // Mark as processed even if skipped — don't retry blocked companies
        await markProcessed(inv.id);
        results.push({
          companyId,
          insightType: inv.insightType,
          status: "skipped",
          reason: aiCheck.reason ?? "AI not allowed",
        });
      }
      continue;
    }

    // Get default scenario for context
    const scenario = await getDefaultScenario(companyId);
    if (!scenario) {
      for (const inv of invalidations) {
        await markProcessed(inv.id);
        results.push({
          companyId,
          insightType: inv.insightType,
          status: "skipped",
          reason: "No default scenario",
        });
      }
      continue;
    }

    // Build context once per company (expensive — don't repeat per insight type)
    let snapshot;
    try {
      const ctx = await buildAiContext(companyId, {
        id: scenario.id,
        name: scenario.name,
        type: scenario.type,
      });
      snapshot = ctx.snapshot;
    } catch (err) {
      log.warn(
        { companyId, err: err instanceof Error ? err : undefined },
        "Failed to build AI context"
      );
      for (const inv of invalidations) {
        results.push({
          companyId,
          insightType: inv.insightType,
          status: "error",
          reason: "Context build failed",
        });
      }
      continue;
    }

    const companyProviderConfig = await getCompanyProviderConfig(companyId);

    // Regenerate each invalidated insight type in parallel
    const regenerationPromises = invalidations.map(async (inv) => {
      const page = INSIGHT_TYPE_TO_PAGE[inv.insightType];
      const cacheType = INSIGHT_TYPE_TO_CACHE_TYPE[inv.insightType];

      if (!page || !cacheType) {
        await markProcessed(inv.id);
        return {
          companyId,
          insightType: inv.insightType,
          status: "skipped" as const,
          reason: `Unknown insight type: ${inv.insightType}`,
        };
      }

      try {
        let insights: unknown[];

        if (page === "dashboard") {
          insights = generateInsights(snapshot);
        } else {
          insights = await generatePageInsights({
            page: page as InsightPage,
            snapshot,
            providerConfig: companyProviderConfig,
          });
        }

        // Update cache
        const cacheKey = `scenario:${scenario.id}`;
        await db
          .insert(aiInsightCache)
          .values({
            companyId,
            type: cacheType,
            key: cacheKey,
            content: insights,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          })
          .onConflictDoUpdate({
            target: [aiInsightCache.companyId, aiInsightCache.type, aiInsightCache.key],
            set: {
              content: insights,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });

        await markProcessed(inv.id);

        log.info(
          { companyId, insightType: inv.insightType, insightCount: insights.length },
          "Insights regenerated"
        );

        return {
          companyId,
          insightType: inv.insightType,
          status: "regenerated" as const,
        };
      } catch (err) {
        log.warn(
          { companyId, insightType: inv.insightType, err: err instanceof Error ? err : undefined },
          "Failed to regenerate insights"
        );
        return {
          companyId,
          insightType: inv.insightType,
          status: "error" as const,
          reason: err instanceof Error ? err.message : "Unknown error",
        };
      }
    });

    const batchResults = await Promise.all(regenerationPromises);
    results.push(...batchResults);
  }

  const regenerated = results.filter((r) => r.status === "regenerated").length;
  log.info({ regenerated, total: results.length }, "Batch regeneration complete");

  return NextResponse.json({
    ok: true,
    processed: results.length,
    regenerated,
    results,
  });
}

async function markProcessed(invalidationId: string): Promise<void> {
  await db
    .update(insightInvalidations)
    .set({ processedAt: new Date() })
    .where(eq(insightInvalidations.id, invalidationId));
}
