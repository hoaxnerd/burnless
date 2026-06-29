import { sha256hex } from "@burnless/db";
import { diffStructured, evaluateRules, type Alert } from "@burnless/engine";
import type { CompetitorSource } from "@burnless/db";
import {
  getDueSources,
  getLatestSnapshot,
  insertSnapshot,
  insertChanges,
  updateSource,
  getCompetitor,
  createNotification,
  getCompanyNotifyUserIds,
} from "@burnless/db";
import { getCollector, type CollectorSource } from "./collectors";
import { buildDigest } from "./notify";

/**
 * Run a single competitor source through the full pipeline:
 *   fetch → parse → hash → store-on-change → diff → rules → insert changes → notify.
 *
 * Returns:
 *   - changed: true if a new snapshot was stored (structured data changed)
 *   - broken: true if fetch/parse/collector failed
 *   - alerts: the rule alerts emitted (empty when no previous snapshot to diff against)
 */
export async function runSource(
  source: CompetitorSource,
): Promise<{ changed: boolean; broken: boolean; alerts: Alert[] }> {
  const collector = getCollector(source.type);
  if (!collector) {
    await updateSource(source.id, source.companyId, {
      lastRunAt: new Date(),
      lastStatus: "no_collector",
      healthState: "broken",
    });
    return { changed: false, broken: true, alerts: [] };
  }

  let raw: Awaited<ReturnType<typeof collector.fetch>>;
  try {
    raw = await collector.fetch(source as unknown as CollectorSource);
  } catch (e) {
    await updateSource(source.id, source.companyId, {
      lastRunAt: new Date(),
      lastStatus: `fetch_error: ${(e as Error).message}`,
      healthState: "broken",
    });
    return { changed: false, broken: true, alerts: [] };
  }

  const parsed = collector.parse(raw, source as unknown as CollectorSource);
  if (parsed.confidence < 0.4) {
    await updateSource(source.id, source.companyId, {
      lastRunAt: new Date(),
      lastStatus: "low_confidence",
      healthState: "broken",
    });
    return { changed: false, broken: true, alerts: [] };
  }

  const structuredHash = sha256hex(JSON.stringify(parsed.structured));
  const latest = await getLatestSnapshot(source.id);

  // Store-on-change: skip if nothing changed.
  if (latest && latest.structuredHash === structuredHash) {
    await updateSource(source.id, source.companyId, {
      lastRunAt: new Date(),
      lastStatus: "ok",
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
    structured: parsed.structured,
    structuredHash,
  });

  let alerts: Alert[] = [];

  // Only diff when a previous snapshot exists.
  if (latest) {
    const changes = diffStructured(latest.structured, parsed.structured);
    alerts = evaluateRules(source.type, changes);

    if (alerts.length > 0) {
      await insertChanges(
        alerts.map((a) => ({
          companyId: source.companyId,
          competitorId: source.competitorId,
          sourceId: source.id,
          snapshotId: snapshot.id,
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
  }

  await updateSource(source.id, source.companyId, {
    lastRunAt: new Date(),
    lastStatus: "ok",
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
