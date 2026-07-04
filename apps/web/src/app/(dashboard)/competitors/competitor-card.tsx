"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { WidgetCard } from "@/components/ui";
import { useLocale } from "@/components/locale/locale-context";
import { CompetitorAnalysisBody } from "./competitor-analysis-body";
import type { CompetitorProfileDto, SourceDto, SnapshotDto } from "./[id]/competitor-profile-view";
import type { CompetitorChangesPayload, CompetitorChangeDto } from "@/lib/swr";

export interface CompetitorCardData {
  competitor: CompetitorProfileDto;
  sources: SourceDto[];
  latestSnapshots: (SnapshotDto | null)[];
  initialChanges: CompetitorChangesPayload;
  changeCount30d: number;
  latestChange: CompetitorChangeDto | null;
}

export function CompetitorCard({ data }: { data: CompetitorCardData }) {
  const { fmtDate } = useLocale();
  const [open, setOpen] = useState(false);
  const { competitor, changeCount30d, latestChange } = data;

  return (
    <WidgetCard>
      <div className="flex w-full items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-start gap-2 text-left"
        >
          {open ? <ChevronDown className="mt-1 h-4 w-4 text-surface-400 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 text-surface-400 shrink-0" />}
          <span className="min-w-0 space-y-1">
            <span className="block text-base font-semibold text-surface-900 truncate">{competitor.name}</span>
            {/* Recent-change activity headline (founder decision). */}
            <span className="block text-sm text-surface-600">
              {changeCount30d > 0 ? (
                <>
                  <span className="font-medium text-surface-900">{changeCount30d} change{changeCount30d === 1 ? "" : "s"}</span>
                  <span className="text-surface-500"> · last 30d</span>
                  {latestChange && (
                    <span className="text-surface-500">{` — ${latestChange.summary} · ${fmtDate(latestChange.detectedAt)}`}</span>
                  )}
                </>
              ) : (
                <span className="text-surface-500">No changes detected yet</span>
              )}
            </span>
          </span>
        </button>
        <Link
          href={`/competitors/${competitor.id}`}
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-surface-400 hover:text-brand-600 shrink-0"
        >
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {open && (
        <div className="mt-4 border-t border-surface-200 pt-4">
          <CompetitorAnalysisBody
            competitor={competitor}
            sources={data.sources}
            latestSnapshots={data.latestSnapshots}
            initialChanges={data.initialChanges}
          />
        </div>
      )}
    </WidgetCard>
  );
}
