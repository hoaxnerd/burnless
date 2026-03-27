/**
 * Vercel Cron endpoint — generates Monday Morning CFO digests for all active companies.
 * Schedule: Every Monday at 8:00 UTC (configured in vercel.json).
 *
 * For each company:
 *   1. Compute weekly metrics
 *   2. Generate AI narrative (if enabled)
 *   3. Store digest in DB
 *   4. Send email to company owner
 */

import { NextResponse } from "next/server";
import { db, companies, users, weeklyDigests } from "@burnless/db";
import { eq } from "drizzle-orm";
import { computeWeeklyDigest, buildDeterministicSummary } from "@/lib/compute-digest";
import { generateDigestNarrative } from "@/lib/digest-narrative";
import { email } from "@/lib/email";
import { weeklyDigestEmail } from "@/lib/email/templates";
import { getAiFlags } from "@/lib/ai-feature-flags";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-helpers";

const CRON_SECRET = process.env.CRON_SECRET;
const SKIP_CRON_AUTH = process.env.DISABLE_CRON_AUTH === "true";

export const GET = withErrorHandler(async function GET(request: Request) {
  // Verify Vercel Cron secret (DISABLE_CRON_AUTH=true for local dev only)
  if (!SKIP_CRON_AUTH) {
    if (!CRON_SECRET) {
      logger("cron").error("CRON_SECRET is not configured");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const allCompanies = await db.select().from(companies);
  const results: { companyId: string; status: string }[] = [];

  for (const company of allCompanies) {
    try {
      // Check if weekly digest is enabled for this company
      const flags = await getAiFlags(company.id);
      const digestEnabled = flags.features.weeklyDigest !== false;

      if (!digestEnabled) {
        results.push({ companyId: company.id, status: "skipped_disabled" });
        continue;
      }

      // Compute metrics
      const metrics = await computeWeeklyDigest(company.id);
      if (!metrics) {
        results.push({ companyId: company.id, status: "skipped_no_scenario" });
        continue;
      }

      // Build deterministic summary
      const deterministicSummary = buildDeterministicSummary(metrics);

      // Generate AI narrative (may return null if AI disabled or fails)
      const narrative = await generateDigestNarrative(company.id, metrics);

      // Upsert digest to DB
      const weekStart = new Date(metrics.weekStart);
      await db
        .insert(weeklyDigests)
        .values({
          companyId: company.id,
          weekStart,
          metrics: metrics as unknown as Record<string, unknown>,
          narrative,
          deterministicSummary,
        })
        .onConflictDoUpdate({
          target: [weeklyDigests.companyId, weeklyDigests.weekStart],
          set: {
            metrics: metrics as unknown as Record<string, unknown>,
            narrative,
            deterministicSummary,
          },
        });

      // Send email to company owner
      const [owner] = await db
        .select()
        .from(users)
        .where(eq(users.id, company.ownerId))
        .limit(1);

      if (owner?.email) {
        const emailData = weeklyDigestEmail({
          companyName: company.name,
          narrative,
          deterministicSummary,
          metrics: {
            cashPosition: metrics.cashPosition,
            cashChangePercent: metrics.cashChangePercent,
            burnRate: metrics.burnRate,
            burnChangePercent: metrics.burnChangePercent,
            runway: metrics.runway,
            mrr: metrics.mrr,
            mrrChangePercent: metrics.mrrChangePercent,
            totalExpenses: metrics.totalExpenses,
            expenseChangePercent: metrics.expenseChangePercent,
            anomalyCount: metrics.anomalyCount,
            headcount: metrics.headcount,
          },
        });

        await email.provider.send({
          to: owner.email,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
        });

        // Update emailSentAt
        await db
          .update(weeklyDigests)
          .set({ emailSentAt: new Date() })
          .where(eq(weeklyDigests.companyId, company.id));
      }

      results.push({ companyId: company.id, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      results.push({ companyId: company.id, status: `error: ${message}` });
    }
  }

  return NextResponse.json({
    ok: true,
    generated: results.filter((r) => r.status === "sent").length,
    total: allCompanies.length,
    results,
  });
});
