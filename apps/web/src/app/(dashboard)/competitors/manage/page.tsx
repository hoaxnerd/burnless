export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { listCompetitors } from "@burnless/db";
import { getCompany } from "@/lib/data";
import { isDomainEnabled } from "@/lib/domain-gating";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { CompetitorsView } from "./competitors-view";
import type { CompetitorsPayload } from "@/lib/swr";

export default async function ManageCompetitorsPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="tracking competitors" />;
  if (!(await isDomainEnabled("competitor", { companyId: company.id }))) notFound();
  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <ManageContent companyId={company.id} />
    </Suspense>
  );
}

async function ManageContent({ companyId }: { companyId: string }) {
  const competitors = await listCompetitors(companyId);
  const initialData: CompetitorsPayload = {
    competitors: competitors.map((c) => ({
      id: c.id, companyId: c.companyId, name: c.name, url: c.url, status: c.status,
      createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    })),
  };
  return <CompetitorsView initialData={initialData} />;
}
