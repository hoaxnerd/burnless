export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { listCompetitors, listSources, listChanges, getLatestSnapshot } from "@burnless/db";
import { getCompany } from "@/lib/data";
import { isDomainEnabled } from "@/lib/domain-gating";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { CompetitorsDashboard, type CompetitorCardData } from "./competitors-dashboard";
import type { CompetitorChangesPayload } from "@/lib/swr";
import type { CompetitorProfileDto, SourceDto, SnapshotDto } from "./[id]/competitor-profile-view";

const THIRTY_DAYS_MS = 30 * 24 * 3_600_000;

export default async function CompetitorsPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="tracking competitors" />;
  if (!(await isDomainEnabled("competitor", { companyId: company.id }))) notFound();
  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <DashboardContent companyId={company.id} />
    </Suspense>
  );
}

async function DashboardContent({ companyId }: Readonly<{ companyId: string }>) {
  const competitors = await listCompetitors(companyId);
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const cards: CompetitorCardData[] = await Promise.all(
    competitors.map(async (c) => {
      const [sources, changesRaw] = await Promise.all([
        listSources(c.id, companyId),
        listChanges(companyId, { competitorId: c.id, limit: 50 }),
      ]);
      const snapshots = await Promise.all(sources.map((s) => getLatestSnapshot(s.id)));

      const competitor: CompetitorProfileDto = { id: c.id, name: c.name, url: c.url };
      const sourceDtos: SourceDto[] = sources.map((s) => ({
        id: s.id, type: s.type, url: s.url, enabled: s.enabled,
        lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
        lastStatus: s.lastStatus, healthState: s.healthState,
      }));
      const latestSnapshots: (SnapshotDto | null)[] = snapshots.map((snap) =>
        snap ? { id: snap.id, sourceId: snap.sourceId, capturedAt: snap.capturedAt.toISOString(), structured: snap.structured as SnapshotDto["structured"] } : null,
      );
      const initialChanges: CompetitorChangesPayload = {
        changes: changesRaw.map((ch) => ({
          id: ch.id, competitorId: ch.competitorId, sourceId: ch.sourceId, snapshotId: ch.snapshotId, companyId: ch.companyId,
          detectedAt: ch.detectedAt.toISOString(), changeType: ch.changeType, summary: ch.summary,
          before: ch.before as Record<string, unknown> | null, after: ch.after as Record<string, unknown> | null,
          severity: ch.severity, acknowledgedAt: ch.acknowledgedAt ? ch.acknowledgedAt.toISOString() : null,
          createdAt: ch.createdAt.toISOString(),
        })),
      };
      const changeCount30d = changesRaw.filter((ch) => ch.detectedAt.getTime() >= cutoff).length;
      const latestChange = initialChanges.changes[0] ?? null;

      return { competitor, sources: sourceDtos, latestSnapshots, initialChanges, changeCount30d, latestChange };
    }),
  );

  return <CompetitorsDashboard cards={cards} />;
}
