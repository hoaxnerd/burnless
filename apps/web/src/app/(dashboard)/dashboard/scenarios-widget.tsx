"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useDashboardLayout } from "./dashboard-layout-context";

interface Scenario {
  id: string;
  name: string;
  type: string;
}

interface ScenariosWidgetProps {
  scenarios: Scenario[];
}

export function ScenariosWidget({ scenarios }: ScenariosWidgetProps) {
  const { reportWidgetReady, reportWidgetNotReady } = useDashboardLayout();

  const isEmpty = scenarios.length === 0;
  useEffect(() => {
    if (isEmpty) {
      reportWidgetNotReady("scenarios");
    } else {
      reportWidgetReady("scenarios");
    }
  }, [isEmpty, reportWidgetReady, reportWidgetNotReady]);

  if (isEmpty) return null;

  return (
    <div className="h-full rounded-2xl bg-surface-0 border border-surface-200 p-5 sm:p-6 hover-lift flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-surface-900">Scenarios</h2>
        <Link
          href="/scenarios"
          className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
        >
          View all
        </Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
        {scenarios.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-surface-50 transition-colors -mx-3"
          >
            <div>
              <p className="text-sm font-medium text-surface-900">{s.name}</p>
              <span className="text-xs text-surface-400 capitalize">{s.type}</span>
            </div>
            <Link
              href="/scenarios"
              className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
            >
              View
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
