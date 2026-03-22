"use client";

/**
 * Dashboard Header — title, catalog button, and board mode.
 * Global mode switcher removed — per-card mode controls are now on each card.
 */

import { LayoutGrid } from "lucide-react";
import { BoardMeetingMode } from "./board-meeting-mode";
import { useDashboardIntelligence } from "./dashboard-intelligence-context";
import { ErrorBoundary } from "@/components/ui/error-boundary";

interface DashboardHeaderProps {
  companyName: string;
  hasData: boolean;
  boardData: {
    companyName: string;
    monthLabel: string;
    cash: number;
    burn: number;
    runway: number;
    mrr: number;
    mrrGrowth: number;
    headcount: number;
    headcountDelta: number;
  };
}

export function DashboardHeader({ companyName, hasData, boardData }: DashboardHeaderProps) {
  const { setCatalogOpen } = useDashboardIntelligence();

  return (
    <div className="mb-8 sm:mb-12 animate-slide-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-surface-400">
            {companyName} &mdash; Financial command center
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasData && (
            <>
              <button
                onClick={() => setCatalogOpen(true)}
                title="Open metrics catalog"
                className="p-2 rounded-lg border border-surface-200 hover:bg-surface-50 transition-colors text-surface-500 hover:text-surface-700"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <ErrorBoundary fallback={null}>
                <BoardMeetingMode data={boardData} />
              </ErrorBoundary>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
