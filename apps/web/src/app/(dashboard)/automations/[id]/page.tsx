export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/skeleton";
import { AutomationDetail } from "./_components/automation-detail";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AutomationDetail id={id} />
    </Suspense>
  );
}
