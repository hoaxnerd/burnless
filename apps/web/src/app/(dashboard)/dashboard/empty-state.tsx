"use client";

import Link from "next/link";
import {
  Upload,
  DollarSign,
  TrendingUp,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

interface EmptyStateProps {
  hasExpenses: boolean;
  hasRevenue: boolean;
  hasFunding: boolean;
}

const steps = [
  {
    key: "funding",
    icon: DollarSign,
    title: "Add your funding",
    description: "Record your capital raises so we can calculate runway and cash position.",
    href: "/funding",
    cta: "Add funding",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    key: "expenses",
    icon: Upload,
    title: "Import expenses",
    description: "Upload a CSV or add expenses manually. AI will auto-categorize everything.",
    href: "/expenses",
    cta: "Add expenses",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    key: "revenue",
    icon: TrendingUp,
    title: "Model revenue",
    description: "Add your revenue streams — subscriptions, one-time, or usage-based.",
    href: "/revenue",
    cta: "Add revenue",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
] as const;

export function DashboardEmptyState({ hasExpenses, hasRevenue, hasFunding }: EmptyStateProps) {
  const completionMap: Record<string, boolean> = {
    funding: hasFunding,
    expenses: hasExpenses,
    revenue: hasRevenue,
  };
  const completedCount = steps.filter((s) => completionMap[s.key]).length;

  return (
    <div className="animate-slide-up">
      {/* Hero */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-10 text-center mb-6">
        <div className="inline-flex items-center justify-center rounded-2xl bg-brand-500/10 p-3 mb-4">
          <Sparkles className="h-6 w-6 text-brand-500" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-surface-900 mb-2">
          Let&apos;s build your financial picture
        </h2>
        <p className="text-sm text-surface-500 max-w-md mx-auto">
          Add your data and Burnless will automatically generate dashboards, forecasts,
          and AI-powered insights for your startup.
        </p>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {steps.map((step, i) => (
            <div
              key={step.key}
              className={`h-1.5 w-12 rounded-full transition-colors duration-500 ${
                completionMap[step.key] ? "bg-brand-500" : "bg-surface-200"
              }`}
            />
          ))}
          <span className="text-xs text-surface-400 ml-2">
            {completedCount}/{steps.length}
          </span>
        </div>
      </div>

      {/* Step cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const done = completionMap[step.key];

          return (
            <Link
              key={step.key}
              href={step.href}
              className={`
                group relative rounded-2xl border p-5 sm:p-6
                transition-all duration-300
                ${
                  done
                    ? "border-success-500/30 bg-success-50/50"
                    : "border-surface-200 bg-surface-0 hover:border-brand-300 hover:shadow-lg"
                }
                animate-slide-up stagger-${i + 1}
              `}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`rounded-xl p-2 ${done ? "bg-success-500/10" : step.bgColor}`}>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-success-500" />
                  ) : (
                    <Icon className={`h-4 w-4 ${step.color}`} />
                  )}
                </div>
                <span className="text-[10px] font-medium uppercase tracking-widest text-surface-400 mt-1">
                  Step {i + 1}
                </span>
              </div>

              <h3 className={`text-sm font-semibold mb-1 ${done ? "text-surface-400 line-through" : "text-surface-900"}`}>
                {step.title}
              </h3>
              <p className="text-xs text-surface-500 leading-relaxed mb-4">
                {step.description}
              </p>

              {!done && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 group-hover:gap-2 transition-all">
                  {step.cta} <ArrowRight className="h-3 w-3" />
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* AI shortcut */}
      <Link
        href="/ai"
        className="
          mt-4 flex items-center justify-center gap-2
          rounded-2xl border border-brand-500/20 bg-brand-50/30
          p-4 text-sm font-medium text-brand-600
          hover:bg-brand-50 hover:border-brand-500/30
          transition-all duration-300
          animate-slide-up stagger-5
        "
      >
        <Sparkles className="h-4 w-4" />
        Or let AI build your financial model from a conversation
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
