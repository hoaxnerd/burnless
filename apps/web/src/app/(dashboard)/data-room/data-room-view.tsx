"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { ImportFlow } from "../import/import-flow";
import type { DataRoomViewProps, TabId } from "./data-room-config";
import { tabs, exportItems, reports } from "./data-room-config";
import { useDataRoomExports } from "./use-data-room-exports";
import { ReportsTab } from "./reports-tab";
import { ExportsTab } from "./exports-tab";

export type { DataRoomViewProps };

export function DataRoomView(props: DataRoomViewProps) {
  const { companyName, scenarioAvailable, scenarioName, keyMetrics, fundingRounds } = props;
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as TabId) || "reports";
  const [activeTab, setActiveTab] = useState<TabId>(
    tabs.some((t) => t.id === initialTab) ? initialTab : "reports"
  );

  const {
    exporting, exported, builderSections,
    handleExport, handleExportAll, handleBuildReport, toggleBuilderSection,
  } = useDataRoomExports(props);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const tabBadges = useMemo(() => ({
    reports: reports.length,
    exports: exportItems.length,
    import: null,
  }), []);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-surface-50">
            Data Room
          </h1>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            Reports, exports, and data imports &mdash; {companyName}
          </p>
        </div>
        {activeTab === "exports" && (
          <button
            onClick={handleExportAll}
            disabled={!!exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors flex-shrink-0 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-100 dark:bg-surface-800 mb-6 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "bg-surface-0 dark:bg-surface-700 text-surface-900 dark:text-surface-50 shadow-sm"
                  : "text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tabBadges[tab.id] && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? "bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400"
                    : "bg-surface-200 dark:bg-surface-700 text-surface-500 dark:text-surface-400"
                }`}>
                  {tabBadges[tab.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "reports" && (
        <ReportsTab scenarioAvailable={scenarioAvailable} />
      )}
      {activeTab === "exports" && (
        <ExportsTab
          keyMetrics={keyMetrics}
          fundingRounds={fundingRounds}
          exportItems={exportItems}
          exporting={exporting}
          exported={exported}
          onExport={handleExport}
          builderSections={builderSections}
          onToggleBuilderSection={toggleBuilderSection}
          onBuildReport={handleBuildReport}
          scenarioName={scenarioName}
        />
      )}
      {activeTab === "import" && <ImportFlow embedded />}
    </div>
  );
}
