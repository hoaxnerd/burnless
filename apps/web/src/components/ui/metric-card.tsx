interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  description?: string;
}

export function MetricCard({ label, value, change, description }: MetricCardProps) {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
      <p className="text-sm font-medium text-surface-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-surface-900">{value}</p>
      {change && (
        <p
          className={`mt-1 text-xs font-medium ${
            change.startsWith("+") ? "text-green-600" : change.startsWith("-") ? "text-red-600" : "text-surface-500"
          }`}
        >
          {change}
        </p>
      )}
      {description && <p className="mt-1 text-xs text-surface-400">{description}</p>}
    </div>
  );
}
