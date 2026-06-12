export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany } from "@/lib/data";
import { PageSkeleton } from "@/components/ui/skeleton";
import { AutomationsView } from "./_components/automations-view";

export default async function AutomationsPage() {
  const company = await getCompany();

  if (!company) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface-0 p-12 text-center">
        <h3 className="mb-2 text-lg font-semibold text-surface-900">Set up your company first</h3>
        <p className="text-sm text-surface-500">
          Complete onboarding to start scheduling automations.
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageSkeleton />}>
      <AutomationsView />
    </Suspense>
  );
}
