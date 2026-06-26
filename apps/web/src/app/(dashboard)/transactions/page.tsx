export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getServerScenarioId, getAccounts, getTransactions } from "@/lib/data";
import { paginatedResponse, DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { TransactionsView } from "./transactions-view";
import type { TransactionsPayload } from "@/lib/swr";

export default async function TransactionsPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="transactions" />;
  const scenarioId = await getServerScenarioId();

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <TransactionsContent companyId={company.id} scenarioActive={!!scenarioId} />
    </Suspense>
  );
}

async function TransactionsContent({ companyId, scenarioActive }: { companyId: string; scenarioActive: boolean }) {
  const [accountsRaw, txRaw] = await Promise.all([
    getAccounts(companyId),
    getTransactions(companyId),
  ]);

  const accounts = accountsRaw
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((x, y) => x.name.localeCompare(y.name));

  // getTransactions returns all rows unpaginated; seed the first page newest-first
  // in the same nested PaginatedResponse shape the view + SWR hook consume. Dates
  // arrive as Date objects here, so they serialize to ISO across the RSC→client
  // prop boundary automatically — hence the documented cast to TransactionsPayload.
  // The sort MUST match GET /api/transactions exactly — date DESC, then id DESC as a
  // deterministic tiebreaker — so "Load more" (which grows the limit) returns a strict
  // superset of this seed and rows never skip or duplicate at the page boundary.
  const sorted = [...txRaw].sort((a, b) => {
    const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
  });
  const initialData = paginatedResponse(
    sorted.slice(0, DEFAULT_PAGE_SIZE + 1) as Array<Record<string, unknown>>,
    DEFAULT_PAGE_SIZE,
    "id",
  ) as unknown as TransactionsPayload;

  return (
    <TransactionsView
      companyId={companyId}
      accounts={accounts}
      initialData={initialData}
      scenarioActive={scenarioActive}
    />
  );
}
