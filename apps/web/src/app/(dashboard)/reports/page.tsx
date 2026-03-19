export default function ReportsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">Reports</h1>
        <p className="mt-1 text-sm text-surface-500">
          Financial statements and custom reports
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          {
            title: "Profit & Loss",
            description: "Income, expenses, and net profit over time",
          },
          {
            title: "Cash Flow",
            description: "Cash inflows, outflows, and net position",
          },
          {
            title: "Balance Sheet",
            description: "Assets, liabilities, and equity snapshot",
          },
          {
            title: "Runway Analysis",
            description: "How long your cash will last at current burn",
          },
          {
            title: "Budget vs Actuals",
            description: "Compare planned vs actual spending",
          },
          {
            title: "Board Report",
            description: "Investor-ready summary with key metrics",
          },
        ].map((report) => (
          <div
            key={report.title}
            className="rounded-xl bg-surface-0 border border-surface-200 p-6 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer"
          >
            <h3 className="text-sm font-semibold text-surface-900">
              {report.title}
            </h3>
            <p className="mt-1 text-xs text-surface-500">
              {report.description}
            </p>
            <span className="mt-4 inline-block text-xs font-medium text-brand-600">
              View report &rarr;
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
