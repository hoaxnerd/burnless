import Link from "next/link";
import { getCompany, getDefaultScenario } from "@/lib/data";

export default async function ReportsPage() {
  const company = await getCompany();
  const scenario = company ? await getDefaultScenario(company.id) : null;

  const reports = [
    {
      title: "Profit & Loss",
      description: "Income, expenses, and net profit over time",
      apiPath: "statements",
      available: !!scenario,
    },
    {
      title: "Cash Flow",
      description: "Cash inflows, outflows, and net position",
      apiPath: "statements",
      available: !!scenario,
    },
    {
      title: "Balance Sheet",
      description: "Assets, liabilities, and equity snapshot",
      apiPath: "statements",
      available: !!scenario,
    },
    {
      title: "Runway Analysis",
      description: "How long your cash will last at current burn",
      apiPath: "metrics",
      available: !!scenario,
    },
    {
      title: "Budget vs Actuals",
      description: "Compare planned vs actual spending",
      apiPath: "statements",
      available: !!scenario,
    },
    {
      title: "Board Report",
      description: "Investor-ready summary with key metrics",
      apiPath: "metrics",
      available: !!scenario,
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">Reports</h1>
        <p className="mt-1 text-sm text-surface-500">
          Financial statements and custom reports
          {scenario && (
            <span className="ml-2 text-surface-400">
              &mdash; {scenario.name} scenario
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <div
            key={report.title}
            className={`rounded-xl bg-surface-0 border border-surface-200 p-6 transition-all ${
              report.available
                ? "hover:border-brand-300 hover:shadow-sm cursor-pointer"
                : "opacity-60"
            }`}
          >
            <h3 className="text-sm font-semibold text-surface-900">
              {report.title}
            </h3>
            <p className="mt-1 text-xs text-surface-500">
              {report.description}
            </p>
            {report.available ? (
              <span className="mt-4 inline-block text-xs font-medium text-brand-600">
                View report &rarr;
              </span>
            ) : (
              <span className="mt-4 inline-block text-xs font-medium text-surface-400">
                Create a scenario first
              </span>
            )}
          </div>
        ))}
      </div>

      {scenario && (
        <div className="mt-8 rounded-xl bg-surface-50 border border-surface-200 p-4">
          <p className="text-xs text-surface-500">
            <span className="font-medium">API endpoint:</span>{" "}
            <code className="text-brand-600">
              /api/statements?scenarioId={scenario.id}&startDate=2026-01&endDate=2026-12
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
