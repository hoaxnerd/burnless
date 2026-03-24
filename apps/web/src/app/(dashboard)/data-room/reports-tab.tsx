"use client";

import Link from "next/link";
import { Zap, ChevronRight } from "lucide-react";
import { reports } from "./data-room-config";

export function ReportsTab({ scenarioAvailable }: { scenarioAvailable: boolean }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.id}
              href={scenarioAvailable ? report.href : "#"}
              className={`group relative rounded-xl border p-5 transition-all ${
                report.featured
                  ? "border-brand-200 dark:border-brand-800 bg-gradient-to-br from-brand-50/50 to-indigo-50/30 dark:from-brand-950/30 dark:to-indigo-950/20 sm:col-span-2 lg:col-span-1"
                  : "border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800"
              } ${
                scenarioAvailable
                  ? "hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 hover:-translate-y-0.5"
                  : "opacity-60 pointer-events-none"
              }`}
            >
              <div className={`absolute top-0 left-4 right-4 h-0.5 rounded-full bg-gradient-to-r ${report.color} opacity-0 group-hover:opacity-100 transition-opacity`} />

              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${report.color} flex items-center justify-center mb-3 shadow-sm`}>
                <Icon className="w-5 h-5 text-white" />
              </div>

              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-1">
                {report.title}
              </h3>
              <p className="text-xs text-surface-500 dark:text-surface-400 mb-3 line-clamp-2">
                {report.description}
              </p>

              {scenarioAvailable ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 group-hover:gap-2 transition-all">
                  <Zap className="w-3 h-3" />
                  Generate report
                  <ChevronRight className="w-3 h-3" />
                </span>
              ) : (
                <span className="text-xs font-medium text-surface-400 dark:text-surface-500">
                  Create a scenario first
                </span>
              )}

              {report.featured && (
                <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full">
                  Featured
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
