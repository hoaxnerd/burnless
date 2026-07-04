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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4 text-surface-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-surface-400 shrink-0" />}
            <span className="text-base font-semibold text-surface-900 truncate">{competitor.name}</span>
          </div>
          {/* Recent-change activity headline (founder decision). */}
          <p className="pl-6 text-sm text-surface-600">
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
          </p>
        </div>
        <span
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-surface-400 hover:text-brand-600 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={`/competitors/${competitor.id}`} className="inline-flex items-center gap-1">
            Open <ExternalLink className="h-3 w-3" />
          </Link>
        </span>
      </button>

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
