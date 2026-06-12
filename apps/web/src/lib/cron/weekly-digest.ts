/**
 * Weekly digest batch job — generates Monday Morning CFO digests for all active
 * companies. Extracted from api/cron/weekly-digest/route.ts (S3a) so it can be
 * driven both by the per-job route (manual/back-compat) and the scheduler core.
 *
 * For each company:
 *   1. Compute weekly metrics
 *   2. Generate AI narrative (if enabled)
 *   3. Store digest in DB
 *   4. Send email to company owner
 */

import { db, companies, users, weeklyDigests } from "@burnless/db";
import { and, eq, gt, inArray } from "drizzle-orm";
import { computeWeeklyDigest, buildDeterministicSummary } from "@/lib/compute-digest";
import { generateDigestNarrative } from "@/lib/digest-narrative";
import { email } from "@/lib/email";
import { weeklyDigestEmail } from "@/lib/email/templates";
import { getAiFlags } from "@/lib/ai-feature-flags";
import { companyCurrency } from "@/lib/server-currency";

async function fetchCompanyBatch(cursor: string | null, limit: number) {
  if (cursor) {
    return db.select().from(companies).where(gt(companies.id, cursor)).orderBy(companies.id).limit(limit);
  }
  return db.select().from(companies).orderBy(companies.id).limit(limit);
}

export async function runWeeklyDigest(): Promise<{
  ok: true;
  generated: number;
  total: number;
  results: { companyId: string; status: string }[];
}> {
  const results: { companyId: string; status: string }[] = [];
  const BATCH_SIZE = 100;
  let cursor: string | null = null;
  let totalCompanies = 0;
  let hasMore = true;

  // Process companies in batches to avoid OOM at scale
  while (hasMore) {
    const batch = await fetchCompanyBatch(cursor, BATCH_SIZE);

    if (batch.length === 0) break;
    hasMore = batch.length === BATCH_SIZE;
    cursor = batch[batch.length - 1]!.id;
    totalCompanies += batch.length;

    // Pre-fetch owners for this batch (avoids N+1)
    const ownerIds = [...new Set(batch.map((c) => c.ownerId).filter(Boolean))] as string[];
    const owners = ownerIds.length
      ? await db.select().from(users).where(inArray(users.id, ownerIds))
      : [];
    const ownerMap = new Map(owners.map((u) => [u.id, u]));

  for (const company of batch) {
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
      const currency = companyCurrency(company);
      const deterministicSummary = buildDeterministicSummary(metrics, currency);

      // Generate AI narrative (may return null if AI disabled or fails)
      const narrative = await generateDigestNarrative(company.id, metrics, currency);

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

      // Send email to company owner (pre-fetched above)
      const owner = company.ownerId ? ownerMap.get(company.ownerId) : undefined;

      if (owner?.email) {
        const emailData = weeklyDigestEmail({
          companyName: company.name,
          narrative,
          deterministicSummary,
          currency,
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
          .where(and(eq(weeklyDigests.companyId, company.id), eq(weeklyDigests.weekStart, weekStart)));
      }

      results.push({ companyId: company.id, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      results.push({ companyId: company.id, status: `error: ${message}` });
    }
  }
  }

  return {
    ok: true,
    generated: results.filter((r) => r.status === "sent").length,
    total: totalCompanies,
    results,
  };
}
