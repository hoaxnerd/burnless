/**
 * @deprecated Use HeroKpiCard (via SwappableMetricCard) instead.
 * Retained only for existing tests; will be removed in a future cleanup.
 */
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

type Trend = "up" | "down" | "flat";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  description?: string;
  icon?: LucideIcon;
  trend?: Trend;
  /** Semantic variant for accent color */
  variant?: "default" | "success" | "danger" | "warning" | "brand";
  loading?: boolean;
}

const trendConfig: Record<Trend, { icon: LucideIcon; color: string }> = {
  up: { icon: TrendingUp, color: "text-success-600" },
  down: { icon: TrendingDown, color: "text-danger-600" },
  flat: { icon: Minus, color: "text-surface-400" },
};

const variantAccent: Record<NonNullable<MetricCardProps["variant"]>, string> = {
  default: "border-surface-200",
  success: "border-l-success-500",
  danger: "border-l-danger-500",
  warning: "border-l-warning-500",
  brand: "border-l-brand-500",
};

export function MetricCard({
  label,
  value,
  change,
  description,
  icon: Icon,
  trend,
  variant = "default",
  loading = false,
}: MetricCardProps) {
  if (loading) {
    return <MetricCardSkeleton />;
  }

  const accentClass = variant === "default" ? variantAccent.default : `border-surface-200 border-l-4 ${variantAccent[variant]}`;
  const TrendIcon = trend ? trendConfig[trend].icon : null;
  const trendColor = trend ? trendConfig[trend].color : "";

  return (
    <div
      className={`rounded-xl bg-surface-0 border ${accentClass} p-6 transition-shadow duration-200 hover:shadow-md group`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-surface-500">{label}</p>
        {Icon && (
          <Icon className="h-4 w-4 text-surface-400 group-hover:text-brand-500 transition-colors" />
        )}
      </div>
      <p className="mt-2 text-3xl font-bold text-surface-900 tabular-nums">{value}</p>
      {(change || description) && (
        <div className="mt-2 flex items-center gap-1.5">
          {TrendIcon && <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />}
          {change && (
            <span
              className={`text-xs font-medium ${
                trend === "up"
                  ? "text-success-600"
                  : trend === "down"
                    ? "text-danger-600"
                    : change.startsWith("+")
                      ? "text-success-600"
                      : change.startsWith("-")
                        ? "text-danger-600"
                        : "text-surface-500"
              }`}
            >
              {change}
            </span>
          )}
          {description && (
            <span className="text-xs text-surface-400">{change ? `· ${description}` : description}</span>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
      <div className="skeleton h-4 w-24 mb-3" />
      <div className="skeleton h-8 w-32 mb-2" />
      <div className="skeleton h-3 w-20" />
    </div>
  );
}
