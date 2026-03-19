import Link from "next/link";
import { getCompany, getScenarios } from "@/lib/data";

export default async function ScenariosPage() {
  const company = await getCompany();
  const scenarioList = company ? await getScenarios(company.id) : [];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Scenarios</h1>
          <p className="mt-1 text-sm text-surface-500">
            Model different futures for your business
          </p>
        </div>
        <Link
          href="/scenarios/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          New scenario
        </Link>
      </div>

      {scenarioList.length === 0 ? (
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
          <div className="mx-auto max-w-md">
            <div className="text-4xl mb-4">🔮</div>
            <h3 className="text-lg font-semibold text-surface-900 mb-2">
              No scenarios yet
            </h3>
            <p className="text-sm text-surface-500 mb-6">
              Create your first scenario to start modeling different outcomes for
              your business — best case, worst case, and everything in between.
            </p>
            <Link
              href="/scenarios/new"
              className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Create your first scenario
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarioList.map((scenario) => (
            <div
              key={scenario.id}
              className="rounded-xl bg-surface-0 border border-surface-200 p-6 hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-surface-900">
                    {scenario.name}
                  </h3>
                  <span className="mt-1 inline-block rounded-full bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-600">
                    {scenario.type}
                  </span>
                </div>
                {scenario.isDefault && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    Default
                  </span>
                )}
                {scenario.isBudget && (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    Budget
                  </span>
                )}
              </div>
              {scenario.description && (
                <p className="mt-2 text-xs text-surface-500">
                  {scenario.description}
                </p>
              )}
              <p className="mt-3 text-xs text-surface-400">
                Created {scenario.createdAt.toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
