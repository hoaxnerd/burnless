import Link from "next/link";
import { getCompany, getDefaultScenario } from "@/lib/data";

const reports = [
  {
    title: "Board Update",
    description: "One-click investor-ready monthly report with AI narratives",
    href: "/reports/board-update",
    icon: "\uD83D\uDCCB",
    featured: true,
  },
  {
    title: "Profit & Loss",
    description: "Income, expenses, and net profit over time",
    href: "/reports/profit-loss",
    icon: "\uD83D\uDCC8",
  },
  {
    title: "Cash Flow",
    description: "Cash inflows, outflows, and net position",
    href: "/reports/cash-flow",
    icon: "\uD83D\uDCB0",
  },
  {
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity snapshot",
    href: "/reports/balance-sheet",
    icon: "\u2696\uFE0F",
  },
  {
    title: "Runway Analysis",
    description: "How long your cash will last at current burn",
    href: "/reports/runway",
    icon: "\u23F1\uFE0F",
  },
  {
    title: "Budget vs Actuals",
    description: "Compare planned vs actual spending",
    href: "/reports/budget-vs-actuals",
    icon: "\uD83C\uDFAF",
  },
  {
    title: "Metrics Explorer",
    description: "Browse all 60+ financial and SaaS metrics",
    href: "/reports/metrics",
    icon: "\uD83D\uDCCA",
  },
  {
    title: "Scenario Comparison",
    description: "Compare two scenarios side by side with delta analysis",
    href: "/reports/scenario-compare",
    icon: "\uD83D\uDD00",
  },
];

export default async function ReportsPage() {
  const company = await getCompany();
  const scenario = company ? await getDefaultScenario(company.id) : null;
  const available = !!scenario;

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Reports</h1>
        <p className="mt-1 text-sm text-surface-500">
          Financial statements, analytics, and custom reports
          {scenario && (
            <span className="ml-2 text-surface-400">
              &mdash; {scenario.name} scenario
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {reports.map((report) => (
          <Link
            key={report.title}
            href={available ? report.href : "#"}
            className={`rounded-xl p-6 transition-all ${
              "featured" in report && report.featured
                ? "bg-brand-50 border-2 border-brand-200 md:col-span-2 lg:col-span-1"
                : "bg-surface-0 border border-surface-200"
            } ${
              available
                ? "hover:border-brand-300 hover:shadow-sm"
                : "opacity-60 pointer-events-none"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{report.icon}</span>
              <div>
                <h3 className="text-sm font-semibold text-surface-900">
                  {report.title}
                </h3>
                <p className="mt-1 text-xs text-surface-500">
                  {report.description}
                </p>
                {available ? (
                  <span className="mt-3 inline-block text-xs font-medium text-brand-600">
                    View report &rarr;
                  </span>
                ) : (
                  <span className="mt-3 inline-block text-xs font-medium text-surface-400">
                    Create a scenario first
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
