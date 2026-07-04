"use client";

/**
 * Competitor profile + change timeline view (Task 15). Nested route under
 * /competitors — mirrors the cap-table / transactions-accounts nesting
 * precedent (back-link header) and the Task-14 competitors-view conventions:
 * design-system components only, SSR-seeded SWR (useCompetitorChanges
 * fallbackData) for a live-updating timeline, and inline token-styled status
 * spans following the StatusPill precedent (no new badge component).
 *
 * This view is now a thin wrapper: its own back-link + name + external-URL
 * header, plus the shared <CompetitorAnalysisBody /> which renders the Sources
 * (+ "Sync now"), Latest pricing, and Activity timeline. The same body is
 * mounted on the dashboard card, so the analysis renders identically in both.
 *
 * Pricing snapshots are competitor-scraped data; prices are rendered (inside
 * the shared body) via formatCurrency() from @burnless/types using the plan's
 * OWN scraped currency (falling back to the company currency) — never a
 * hardcoded symbol and never forcing the company currency onto a competitor's
 * price.
 */

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { CompetitorChangesPayload } from "@/lib/swr";
import { CompetitorAnalysisBody } from "../competitor-analysis-body";

// ── JSON-safe prop DTOs (Date → ISO string; mirrors the list-page DTO style) ──

export interface CompetitorProfileDto {
  id: string;
  name: string;
  url: string;
}

export interface SourceDto {
  id: string;
  /** "pricing" | "social" | "page" */
  type: string;
  url: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  /** "ok" | "broken" */
  healthState: string;
}

interface PlanDto {
  name: string;
  price: { amount: number | null; currency: string | null; period: string | null };
  features: string[];
}

export interface SnapshotDto {
  id: string;
  sourceId: string;
  capturedAt: string;
  structured: { plans?: PlanDto[] } | null;
}

interface CompetitorProfileViewProps {
  competitor: CompetitorProfileDto;
  sources: SourceDto[];
  /** Latest snapshot per source, aligned by index with `sources`. */
  latestSnapshots: (SnapshotDto | null)[];
  initialChanges: CompetitorChangesPayload;
}

// ── View ────────────────────────────────────────────────────────────────────

export function CompetitorProfileView({
  competitor,
  sources,
  latestSnapshots,
  initialChanges,
}: CompetitorProfileViewProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/competitors"
          className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Competitors
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900">
              {competitor.name}
            </h1>
            <a
              href={competitor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-surface-500 hover:text-brand-600 transition-colors"
            >
              {competitor.url}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </header>

      <CompetitorAnalysisBody
        competitor={competitor}
        sources={sources}
        latestSnapshots={latestSnapshots}
        initialChanges={initialChanges}
      />
    </div>
  );
}
