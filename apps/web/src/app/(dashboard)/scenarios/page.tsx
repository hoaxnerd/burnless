export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getScenarios } from "@/lib/data";
import { ScenariosView } from "./scenarios-view";
import { NewScenarioButton } from "./new-scenario-button";

async function ScenariosContent() {
  const company = await getCompany();
  const scenarioList = company ? await getScenarios(company.id) : [];

  const scenarioData = scenarioList.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    source: s.source,
    status: s.status,
    color: s.color,
    overrideCount: s.overrideCount ?? 0,
    autoDeleteAt: s.autoDeleteAt
      ? s.autoDeleteAt instanceof Date
        ? s.autoDeleteAt.toISOString()
        : String(s.autoDeleteAt)
      : null,
    sourceScenarioId: s.sourceScenarioId ?? null,
    createdAt: s.createdAt instanceof Date
      ? s.createdAt.toISOString()
      : String(s.createdAt ?? new Date().toISOString()),
  }));

  return <ScenariosView scenarios={scenarioData} />;
}

export default function ScenariosPage() {
  return (
    <div>
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Scenarios</h1>
          <p className="mt-1 text-sm text-surface-500">
            Model different futures for your business
          </p>
        </div>
        <NewScenarioButton />
      </div>

      <Suspense fallback={<ScenariosListSkeleton />}>
        <ScenariosContent />
      </Suspense>
    </div>
  );
}

function ScenariosListSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-label="Loading scenarios">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
            <div className="h-5 w-32 bg-surface-100 rounded mb-3" />
            <div className="h-3 w-20 bg-surface-50 rounded mb-4" />
            <div className="h-3 w-full bg-surface-50 rounded" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading scenarios...</span>
    </div>
  );
}
