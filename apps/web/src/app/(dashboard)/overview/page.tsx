export default function OverviewPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">Overview</h1>
        <p className="mt-1 text-sm text-surface-500">
          Your company&apos;s financial health at a glance
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          {
            label: "Cash Balance",
            value: "$0",
            change: null,
            description: "Connect a bank account to see live data",
          },
          {
            label: "Monthly Burn",
            value: "$0",
            change: null,
            description: "Add expenses to calculate burn rate",
          },
          {
            label: "Runway",
            value: "-- months",
            change: null,
            description: "Based on current cash and burn rate",
          },
          {
            label: "MRR",
            value: "$0",
            change: null,
            description: "Add revenue streams to track MRR",
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl bg-surface-0 border border-surface-200 p-6"
          >
            <p className="text-sm font-medium text-surface-500">
              {metric.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-surface-900">
              {metric.value}
            </p>
            <p className="mt-1 text-xs text-surface-400">
              {metric.description}
            </p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <h2 className="text-lg font-semibold text-surface-900 mb-4">
          Get started
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "Set up your company",
              description:
                "Add your company details, stage, and business model",
              action: "Configure",
            },
            {
              title: "Connect accounts",
              description:
                "Link your bank, accounting, or payroll to sync data automatically",
              action: "Connect",
            },
            {
              title: "Ask the AI",
              description:
                "Describe your business and let AI build your first financial model",
              action: "Start chatting",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-surface-200 p-4 hover:border-brand-300 hover:bg-brand-50/50 transition-colors cursor-pointer"
            >
              <h3 className="text-sm font-semibold text-surface-900">
                {item.title}
              </h3>
              <p className="mt-1 text-xs text-surface-500">
                {item.description}
              </p>
              <span className="mt-3 inline-block text-xs font-medium text-brand-600">
                {item.action} &rarr;
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
