export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  getCompetitor,
  listSources,
  listChanges,
  getLatestSnapshot,
} from "@burnless/db";
import { getCompany } from "@/lib/data";
import { isDomainEnabled } from "@/lib/domain-gating";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import type { CompetitorChangesPayload } from "@/lib/swr";
import {
  CompetitorProfileView,
  type CompetitorProfileDto,
  type SourceDto,
  type SnapshotDto,
} from "./competitor-profile-view";

export default async function CompetitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const company = await getCompany();
  if (!company) return <SetupPrompt context="tracking competitors" />;

  // Page-level domain gate — mirrors the requireDomainEnabled guard the REST
  // routes use and the Task-14 list page. If the competitor domain is off for
  // this company/deployment, the route 404s.
  if (!(await isDomainEnabled("competitor", { companyId: company.id }))) {
    notFound();
  }

  const competitor = await getCompetitor(id, company.id);
  if (!competitor) notFound();

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <CompetitorContent companyId={company.id} competitorId={id} competitor={competitor} />
    </Suspense>
  );
}

async function CompetitorContent({
  companyId,
  competitorId,
  competitor,
}: {
  companyId: string;
  competitorId: string;
  competitor: NonNullable<Awaited<ReturnType<typeof getCompetitor>>>;
}) {
  const [sources, changes] = await Promise.all([
    listSources(competitorId, companyId),
    listChanges(companyId, { competitorId, limit: 50 }),
  ]);
  const snapshots = await Promise.all(sources.map((s) => getLatestSnapshot(s.id)));

  // Shape everything to JSON-safe DTOs (Date → ISO string) so the SSR seed
  // matches the client SWR fetch exactly (fallbackData applies cleanly) and no
  // live Date objects cross the RSC → client boundary.
  const competitorDto: CompetitorProfileDto = {
    id: competitor.id,
    name: competitor.name,
    url: competitor.url,
  };

  const sourceDtos: SourceDto[] = sources.map((s) => ({
    id: s.id,
    type: s.type,
    url: s.url,
    enabled: s.enabled,
    lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
    lastStatus: s.lastStatus,
    healthState: s.healthState,
  }));

  const latestSnapshots: (SnapshotDto | null)[] = snapshots.map((snap) =>
    snap
      ? {
          id: snap.id,
          sourceId: snap.sourceId,
          capturedAt: snap.capturedAt.toISOString(),
          structured: snap.structured as SnapshotDto["structured"],
        }
      : null,
  );

  const initialChanges: CompetitorChangesPayload = {
    changes: changes.map((c) => ({
      id: c.id,
      competitorId: c.competitorId,
      sourceId: c.sourceId,
      snapshotId: c.snapshotId,
      companyId: c.companyId,
      detectedAt: c.detectedAt.toISOString(),
      changeType: c.changeType,
      summary: c.summary,
      before: c.before as Record<string, unknown> | null,
      after: c.after as Record<string, unknown> | null,
      severity: c.severity,
      acknowledgedAt: c.acknowledgedAt ? c.acknowledgedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    })),
  };

  return (
    <CompetitorProfileView
      competitor={competitorDto}
      sources={sourceDtos}
      latestSnapshots={latestSnapshots}
      initialChanges={initialChanges}
    />
  );
}
