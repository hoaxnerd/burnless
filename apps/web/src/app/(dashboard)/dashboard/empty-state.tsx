"use client";

import Link from "next/link";
import {
  Upload,
  DollarSign,
  TrendingUp,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileSpreadsheet,
} from "lucide-react";

interface EmptyStateProps {
  companyName: string;
  hasExpenses: boolean;
  hasRevenue: boolean;
  hasFunding: boolean;
}

export function DashboardEmptyState({
  companyName,
  hasExpenses,
  hasRevenue,
  hasFunding,
}: EmptyStateProps) {
  const hasAnyFinancials = hasExpenses || hasRevenue || hasFunding;

  // 3-step progress: account created (always done), add financials, review
  const progressSteps = [
    { label: "Created account", done: true },
    { label: "Add your financials", done: hasAnyFinancials },
    { label: "Review & customize", done: hasExpenses && hasRevenue && hasFunding },
  ];
  const completedCount = progressSteps.filter((s) => s.done).length;

  // Find the current active step (first incomplete)
  const activeIndex = progressSteps.findIndex((s) => !s.done);

  return (
    <div className="animate-slide-up">
      {/* Welcome + Progress */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8 mb-4">
        <p className="text-sm text-surface-400 mb-1">
          Here&apos;s what your dashboard will look like:
        </p>
        <h2 className="text-lg sm:text-xl font-bold text-surface-900 mb-6">
          Welcome to burnless, {companyName}
        </h2>

        {/* Progress steps */}
        <div className="rounded-xl border border-surface-200 bg-surface-50/50 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Get started
            </span>
            <span className="text-xs text-surface-400">
              {completedCount} of {progressSteps.length} complete
            </span>
          </div>

          <div className="space-y-3">
            {progressSteps.map((step, i) => {
              const isActive = i === activeIndex;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success-500 shrink-0" />
                  ) : isActive ? (
                    <ArrowRight className="h-4 w-4 text-brand-500 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-surface-300 shrink-0" />
                  )}
                  <span
                    className={`text-sm ${
                      step.done
                        ? "text-surface-400 line-through"
                        : isActive
                          ? "text-surface-900 font-medium"
                          : "text-surface-400"
                    }`}
                  >
                    {step.label}
                  </span>

                  {/* Inline CTAs for the "Add financials" step */}
                  {isActive && i === 1 && (
                    <div className="flex items-center gap-2 ml-auto">
                      <Link
                        href="/funding"
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                      >
                        Quick Setup
                      </Link>
                      <Link
                        href="/expenses"
                        className="rounded-lg border border-surface-200 bg-surface-0 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 transition-colors inline-flex items-center gap-1.5"
                      >
                        <FileSpreadsheet className="h-3 w-3" />
                        Import CSV
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI path */}
      <Link
        href="/ai"
        className="
          group flex items-center justify-between
          rounded-2xl border border-brand-500/20 bg-brand-50/30
          p-5 sm:p-6 text-left
          hover:bg-brand-50 hover:border-brand-500/40 hover:shadow-md
          transition-all duration-300
          animate-slide-up stagger-2
        "
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-500/10 p-2 mt-0.5">
            <Sparkles className="h-4 w-4 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-surface-900 mb-0.5">
              Or let AI do it
            </p>
            <p className="text-xs text-surface-500">
              Tell AI about your company and it&apos;ll build your financial model in under 60 seconds.
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-brand-500 shrink-0 ml-4 group-hover:translate-x-1 transition-transform" />
      </Link>

      {/* Direct links for individual data types if user has partial data */}
      {hasAnyFinancials && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 animate-slide-up stagger-3">
          {!hasFunding && (
            <Link
              href="/funding"
              className="group flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              <div className="rounded-lg bg-emerald-500/10 p-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-900">Add funding</p>
                <p className="text-[11px] text-surface-400">Unlock Cash & Runway</p>
              </div>
              <ArrowRight className="h-3 w-3 text-surface-300 group-hover:text-emerald-500 transition-colors" />
            </Link>
          )}
          {!hasExpenses && (
            <Link
              href="/expenses"
              className="group flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4 hover:border-orange-300 hover:shadow-sm transition-all"
            >
              <div className="rounded-lg bg-orange-500/10 p-1.5">
                <Upload className="h-3.5 w-3.5 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-900">Add expenses</p>
                <p className="text-[11px] text-surface-400">Unlock Burn Rate</p>
              </div>
              <ArrowRight className="h-3 w-3 text-surface-300 group-hover:text-orange-500 transition-colors" />
            </Link>
          )}
          {!hasRevenue && (
            <Link
              href="/revenue"
              className="group flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4 hover:border-violet-300 hover:shadow-sm transition-all"
            >
              <div className="rounded-lg bg-violet-500/10 p-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-900">Add revenue</p>
                <p className="text-[11px] text-surface-400">Unlock MRR</p>
              </div>
              <ArrowRight className="h-3 w-3 text-surface-300 group-hover:text-violet-500 transition-colors" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
