import {
  sha256hex,
  getDueSources,
  getLatestSnapshot,
  insertSnapshot,
  insertChanges,
  updateSource,
  getCompetitor,
  createNotification,
  getCompanyNotifyUserIds,
} from "@burnless/db";
import {
  diffStructured,
  evaluateRules,
  diffText,
  normalizeHtml,
  contentChangeAlert,
  type Alert,
} from "@burnless/engine";
import type { CompetitorSource } from "@burnless/db";
import { getCollector, httpFetch, type CollectorSource, type RawCapture } from "./collectors";
import { buildDigest } from "./notify";

/** Human page label for the Tier-1 content-change summary. */
const SOURCE_LABELS: Record<string, string> = {
  pricing: "Pricing page",
  social: "Social page",
  page: "Page",
  feed: "Feed",
  sitemap: "Sitemap",
};
function sourceLabel(type: string): string {
  return SOURCE_LABELS[type] ?? "Page";
}

/**
 * Persist change alerts to the DB and fan-out in-app notifications to all
 * company owners/admins. Extracted from runSource to reduce cognitive complexity.
 */
async function persistAlertsAndNotify(
  source: CompetitorSource,
  snapshotId: string,
  alerts: Alert[],
): Promise<void> {
  if (alerts.length === 0) return;

  await insertChanges(
    alerts.map((a) => ({
      companyId: source.companyId,
      competitorId: source.competitorId,
      sourceId: source.id,
      snapshotId,
      changeType: a.changeType,
      summary: a.summary,
      before: a.before ?? null,
      after: a.after ?? null,
      severity: a.severity,
    })),
  );

  const competitor = await getCompetitor(source.competitorId, source.companyId);
  const digest = buildDigest(competitor?.name ?? "competitor", alerts);
  const userIds = await getCompanyNotifyUserIds(source.companyId);
  for (const userId of userIds) {
    await createNotification({
      companyId: source.companyId,
      userId,
      category: "competitor",
      title: digest.title,
      body: digest.body,
      severity: digest.severity,
      link: `/competitors/${source.competitorId}`,
    });
  }
}

/**
 * Run a single competitor source through the reframed pipeline (spec §5):
 *   fetch → Tier 1 (normalize → content hash → store-on-change → text-diff →
 *   generic `content` change) → Tier 2 (confident structured parse → typed
 *   changes) → rules → insert changes → notify.
 *
 * Tier 1 ALWAYS runs (source-type-agnostic; `page` sources have no collector).
 * Store-on-change is keyed on the NORMALIZED content hash (not rawHash), so
 * nonce/CSRF/analytics churn in the raw HTML no longer counts as a change.
 */
export async function runSource(
  source: CompetitorSource,
): Promise<{ changed: boolean; broken: boolean; alerts: Alert[] }> {
  const collector = getCollector(source.type);

  // ── Fetch (Tier 1 needs the raw regardless of a structured collector). ──
  let raw: RawCapture;
  try {
    raw = collector
      ? await collector.fetch(source as unknown as CollectorSource)
      : await httpFetch(source.url);
  } catch (e) {
    await updateSource(source.id, source.companyId, {
      lastRunAt: new Date(),
      lastStatus: `fetch_error: ${(e as Error).message}`,
      healthState: "broken",
    });
    return { changed: false, broken: true, alerts: [] };
  }

  // ── Tier 1: normalize → content hash. ──
  const normalized = normalizeHtml(raw.raw);
  const normalizedHash = sha256hex(normalized);

  // ── Tier 2 (optional, confidence-gated): structured extraction. ──
  let structured: unknown = {};
  let parseConfident = false;
  if (collector) {
    const parsed = collector.parse(raw, source as unknown as CollectorSource);
    if (parsed.confidence >= 0.4) {
      structured = parsed.structured;
      parseConfident = true;
    }
  }
  const structuredHash = sha256hex(JSON.stringify(structured));

  const latest = await getLatestSnapshot(source.id);
  const okStatus = parseConfident ? "ok" : "content_only";

  // ── Store-on-change: skip only when BOTH content AND structured are same. ──
  if (
    latest &&
    latest.normalizedHash === normalizedHash &&
    latest.structuredHash === structuredHash
  ) {
    await updateSource(source.id, source.companyId, {
      lastRunAt: new Date(),
      lastStatus: okStatus,
      healthState: "ok",
    });
    return { changed: false, broken: false, alerts: [] };
  }

  const snapshot = await insertSnapshot({
    companyId: source.companyId,
    competitorId: source.competitorId,
    sourceId: source.id,
    raw: raw.raw,
    rawHash: sha256hex(raw.raw),
    structured,
    structuredHash,
    normalized,
    normalizedHash,
  });

  const alerts: Alert[] = [];
  if (latest) {
    // Tier 1 — content change, only when a prior NORMALIZED baseline exists.
    // A legacy snapshot from before the reframe migration has normalized == null;
    // that's a pure one-time re-baseline, not a real content change — don't alert.
    if (latest.normalized != null) {
      const contentAlert = contentChangeAlert(
        diffText(latest.normalized, normalized),
        sourceLabel(source.type),
      );
      if (contentAlert) alerts.push(contentAlert);
    }

    // Tier 2 — typed structured changes, only when we have a confident parse.
    if (parseConfident) {
      alerts.push(...evaluateRules(source.type, diffStructured(latest.structured, structured)));
    }
  }

  await persistAlertsAndNotify(source, snapshot.id, alerts);

  await updateSource(source.id, source.companyId, {
    lastRunAt: new Date(),
    lastStatus: okStatus,
    healthState: "ok",
  });
  return { changed: true, broken: false, alerts };
}

/**
 * Run all competitor sources that are currently due.
 * Called by the scheduler (Task 8) and the /api/competitor/sync route (Task 12).
 */
export async function runDueCompetitorSyncs(
  now: Date,
): Promise<{ ok: boolean; summary: string }> {
  const due = await getDueSources(now);
  let changed = 0;
  let broken = 0;

  for (const s of due) {
    try {
      const r = await runSource(s);
      if (r.changed) changed++;
      if (r.broken) broken++;
    } catch {
      broken++;
    }
  }

  return {
    ok: true,
    summary: `${due.length} due, ${changed} changed, ${broken} need attention`,
  };
}
