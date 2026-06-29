"use client";

/**
 * Competitor profile + change timeline view (Task 15). Nested route under
 * /competitors — mirrors the cap-table / transactions-accounts nesting
 * precedent (back-link header) and the Task-14 competitors-view conventions:
 * design-system components only, SSR-seeded SWR (useCompetitorChanges
 * fallbackData) for a live-updating timeline, and inline token-styled status
 * spans following the StatusPill precedent (no new badge component).
 *
 * Pricing snapshots are competitor-scraped data; prices are rendered via
 * formatCurrency() from @burnless/types using the plan's OWN scraped currency
 * (falling back to the company currency) — never a hardcoded symbol and never
 * forcing the company currency onto a competitor's price.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { DataTable, Button, WidgetCard } from "@/components/ui";
import { useLocale } from "@/components/locale/locale-context";
import { formatCurrency, isValidCurrency, type CurrencyCode } from "@burnless/types";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import {
  useCompetitorChanges,
  type CompetitorChangeDto,
  type CompetitorChangesPayload,
} from "@/lib/swr";

// ── JSON-safe prop DTOs (Date → ISO string; mirrors the list-page DTO style) ──

export interface CompetitorProfileDto {
  id: string;
  name: string;
  url: string;
}

export interface SourceDto {
  id: string;
  /** "pricing" | "social" */
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

// ── Inline token-styled status spans (StatusPill precedent — NOT new
//    @/components/ui components; same pattern as the Task-14 list view). ───────

const PILL_BASE =
  "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase";

/** Source health: "broken" → danger ("Needs attention"), else success ("Healthy"). */
function HealthBadge({
  healthState,
  lastStatus,
}: {
  healthState: string;
  lastStatus: string | null;
}) {
  if (healthState === "broken") {
    return (
      <span
        className={`${PILL_BASE} bg-danger-50 text-danger-600`}
        title={lastStatus ?? undefined}
      >
        Needs attention
      </span>
    );
  }
  return <span className={`${PILL_BASE} bg-success-50 text-success-700`}>Healthy</span>;
}

/** Change severity: critical → danger, warning → warning, else (info) → surface. */
function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "critical"
      ? "bg-danger-50 text-danger-600"
      : severity === "warning"
        ? "bg-warning-50 text-warning-700"
        : "bg-surface-100 text-surface-600";
  return <span className={`${PILL_BASE} ${cls}`}>{severity}</span>;
}

// ── View ────────────────────────────────────────────────────────────────────

export function CompetitorProfileView({
  competitor,
  sources,
  latestSnapshots,
  initialChanges,
}: CompetitorProfileViewProps) {
  const router = useRouter();
  const { fmtDate, currency, locale } = useLocale();
  const { data, mutate } = useCompetitorChanges(competitor.id, {
    fallbackData: initialChanges,
  });

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const changes = data?.changes ?? initialChanges.changes;

  // First pricing source that produced a snapshot with plans → the headline
  // pricing card. Snapshots are aligned by index with `sources`.
  const pricingPlans = (() => {
    for (let i = 0; i < sources.length; i++) {
      if (sources[i]?.type !== "pricing") continue;
      const plans = latestSnapshots[i]?.structured?.plans;
      if (plans && plans.length > 0) return plans;
    }
    return null;
  })();

  async function handleSync() {
    setSyncError(null);
    setSyncing(true);
    try {
      const res = await apiFetch(`/api/competitors/${competitor.id}/sync`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to sync");
      }
      // Refresh the live changes timeline AND the RSC-sourced source health /
      // last-checked / latest-snapshot props.
      void mutate();
      router.refresh();
    } catch (err) {
      setSyncError(toUserMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  const changeColumns = [
    {
      key: "severity",
      header: "Severity",
      render: (c: CompetitorChangeDto) => <SeverityBadge severity={c.severity} />,
      sortValue: (c: CompetitorChangeDto) => c.severity,
    },
    {
      key: "summary",
      header: "Change",
      render: (c: CompetitorChangeDto) => (
        <span className="text-surface-900">{c.summary}</span>
      ),
    },
    {
      key: "detectedAt",
      header: "Detected",
      align: "right" as const,
      render: (c: CompetitorChangeDto) => (
        <span className="text-surface-500">{fmtDate(c.detectedAt)}</span>
      ),
      sortValue: (c: CompetitorChangeDto) => c.detectedAt,
    },
  ];

  const planColumns = [
    {
      key: "name",
      header: "Plan",
      render: (p: PlanDto) => <span className="font-medium text-surface-900">{p.name}</span>,
    },
    {
      key: "price",
      header: "Price",
      align: "right" as const,
      render: (p: PlanDto) => (
        <span className="text-surface-900">
          {p.price.amount != null
              ? formatCurrency(p.price.amount, (isValidCurrency(p.price.currency ?? "") ? p.price.currency as CurrencyCode : currency), locale)
              : "—"}
          {p.price.period ? (
            <span className="text-surface-500">{` / ${p.price.period}`}</span>
          ) : null}
        </span>
      ),
    },
  ];

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

      {syncError && (
        <div
          className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600"
          role="alert"
        >
          {syncError}
        </div>
      )}

      {/* Sources ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-surface-900">Sources</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-surface-500">No sources tracked for this competitor.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sources.map((source) => (
              <WidgetCard key={source.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-surface-900 capitalize">
                        {source.type}
                      </span>
                      <HealthBadge
                        healthState={source.healthState}
                        lastStatus={source.lastStatus}
                      />
                    </div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 max-w-full truncate text-xs text-surface-500 hover:text-brand-600 transition-colors"
                    >
                      <span className="truncate">{source.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <p className="text-xs text-surface-500">
                      {source.lastRunAt
                        ? `Last checked ${fmtDate(source.lastRunAt)}`
                        : "Never checked"}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    state={syncing ? "loading" : "idle"}
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={handleSync}
                  >
                    Sync now
                  </Button>
                </div>
              </WidgetCard>
            ))}
          </div>
        )}
      </section>

      {/* Latest pricing snapshot ─────────────────────────────────────────── */}
      {pricingPlans && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-surface-900">Latest pricing</h2>
          <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
            <DataTable
              columns={planColumns}
              data={pricingPlans}
              rowKey={(p) => p.name}
              emptyMessage="No pricing plans captured."
            />
          </div>
        </section>
      )}

      {/* Change timeline ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-surface-900">Activity</h2>
        <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
          <DataTable
            columns={changeColumns}
            data={changes}
            rowKey={(c) => c.id}
            emptyMessage="No changes detected yet."
          />
        </div>
      </section>
    </div>
  );
}
