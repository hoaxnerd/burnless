export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { db, transactions } from "@burnless/db";
import { eq, sql } from "drizzle-orm";
import { getCompany, getAccounts } from "@/lib/data";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { AccountsView } from "./accounts-view";
import type { FinancialAccount } from "@/lib/swr";

export default async function AccountsPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="accounts" />;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <AccountsContent companyId={company.id} />
    </Suspense>
  );
}

async function AccountsContent({ companyId }: { companyId: string }) {
  const [accountsRaw, counts] = await Promise.all([
    getAccounts(companyId),
    db
      .select({ accountId: transactions.accountId, count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.companyId, companyId))
      .groupBy(transactions.accountId),
  ]);

  const countByAccount = new Map(counts.map((c) => [c.accountId, c.count]));

  // Shape to FinancialAccount[] (JSON-serialized: Date → ISO string across the
  // RSC→client boundary). transactionCount is base-table actuals (§0.2).
  const accounts: FinancialAccount[] = accountsRaw
    .map((a) => ({
      id: a.id,
      companyId: a.companyId,
      name: a.name,
      type: a.type,
      category: a.category,
      parentId: a.parentId,
      isSystem: a.isSystem,
      sortOrder: a.sortOrder,
      coversHeadcount: a.coversHeadcount,
      transactionCount: countByAccount.get(a.id) ?? 0,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }))
    .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name));

  return <AccountsView accounts={accounts} />;
}
