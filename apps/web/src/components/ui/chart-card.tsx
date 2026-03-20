interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartCard({ title, subtitle, action, children }: ChartCardProps) {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-surface-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
