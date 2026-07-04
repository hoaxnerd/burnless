"use client";

/**
 * Shared competitor analysis body (Tiers-1+2 reframe): Sources (+ "Sync now"),
 * Latest pricing, and the Activity timeline. Mounted in two places — the
 * /competitors/[id] permalink (with a header) and the dashboard card (expanded)
 * — so the analysis renders identically in both. Design-system components only;
 * a `content_changed` change gets an inline <details> disclosure (existing
 * tokens, no new component) showing the added/removed line snippet.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
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
import type {
  CompetitorProfileDto,
  SourceDto,
  SnapshotDto,
} from "./[id]/competitor-profile-view";

const PILL_BASE =
  "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase";

function HealthBadge({ healthState, lastStatus }: { healthState: string; lastStatus: string | null }) {
  if (healthState === "broken") {
    return (
      <span className={`${PILL_BASE} bg-danger-50 text-danger-600`} title={lastStatus ?? undefined}>
        Needs attention
      </span>
    );
  }
  return <span className={`${PILL_BASE} bg-success-50 text-success-700`}>Healthy</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "critical"
      ? "bg-danger-50 text-danger-600"
      : severity === "warning"
        ? "bg-warning-50 text-warning-700"
        : "bg-surface-100 text-surface-600";
  return <span className={`${PILL_BASE} ${cls}`}>{severity}</span>;
}

/** Content-change line snippet (added green / removed red) — reuse tokens only. */
function ContentSnippet({ change }: { change: CompetitorChangeDto }) {
  const before = (change.before as { lines?: string[]; truncated?: boolean } | null) ?? null;
  const after = (change.after as { lines?: string[]; truncated?: boolean } | null) ?? null;
  const removed = before?.lines ?? [];
  const added = after?.lines ?? [];
  if (removed.length === 0 && added.length === 0) return null;
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-surface-500 hover:text-surface-900 select-none">
        View changed lines
      </summary>
      <div className="mt-2 space-y-1 rounded-md bg-surface-50 border border-surface-200 p-2 font-mono">
        {removed.map((l, i) => (
          <div key={`r${i}`} className="text-danger-600 truncate">- {l}</div>
        ))}
        {added.map((l, i) => (
          <div key={`a${i}`} className="text-success-700 truncate">+ {l}</div>
        ))}
        {(before?.truncated || after?.truncated) && (
          <div className="text-surface-400">… more lines truncated</div>
        )}
      </div>
    </details>
  );
}

interface Props {
  competitor: CompetitorProfileDto;
  sources: SourceDto[];
  latestSnapshots: (SnapshotDto | null)[];
  initialChanges: CompetitorChangesPayload;
}

export function CompetitorAnalysisBody({ competitor, sources, latestSnapshots, initialChanges }: Props) {
  const router = useRouter();
  const { fmtDate, currency, locale } = useLocale();
  const { data, mutate } = useCompetitorChanges(competitor.id, { fallbackData: initialChanges });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const changes = data?.changes ?? initialChanges.changes;

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
      const res = await apiFetch(`/api/competitors/${competitor.id}/sync`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to sync");
      }
      // mutate() refreshes the SWR changes timeline; router.refresh() re-runs
      // the RSC props (source health / last-checked / latest-pricing snapshot),
      // which don't come from SWR — otherwise "Sync now" leaves them stale
      // until a manual reload. Correct for both mounts (permalink + dashboard).
      void mutate();
      router.refresh();
    } catch (err) {
      setSyncError(toUserMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  const planColumns = [
    { key: "name", header: "Plan", render: (p: { name: string }) => <span className="font-medium text-surface-900">{p.name}</span> },
    {
      key: "price",
      header: "Price",
      align: "right" as const,
      render: (p: { price: { amount: number | null; currency: string | null; period: string | null } }) => (
        <span className="text-surface-900">
          {p.price.amount != null
            ? formatCurrency(p.price.amount, isValidCurrency(p.price.currency ?? "") ? (p.price.currency as CurrencyCode) : currency, locale)
            : "—"}
          {p.price.period ? <span className="text-surface-500">{` / ${p.price.period}`}</span> : null}
        </span>
      ),
    },
  ];

  const changeColumns = [
    { key: "severity", header: "Severity", render: (c: CompetitorChangeDto) => <SeverityBadge severity={c.severity} />, sortValue: (c: CompetitorChangeDto) => c.severity },
    {
      key: "summary",
      header: "Change",
      render: (c: CompetitorChangeDto) => (
        <div className="min-w-0">
          <span className="text-surface-900">{c.summary}</span>
          {c.changeType === "content_changed" && <ContentSnippet change={c} />}
        </div>
      ),
    },
    { key: "detectedAt", header: "Detected", align: "right" as const, render: (c: CompetitorChangeDto) => <span className="text-surface-500">{fmtDate(c.detectedAt)}</span>, sortValue: (c: CompetitorChangeDto) => c.detectedAt },
  ];

  return (
    <div className="space-y-6">
      {syncError && (
        <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600" role="alert">
          {syncError}
        </div>
      )}

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
                      <span className="text-sm font-semibold text-surface-900 capitalize">{source.type}</span>
                      <HealthBadge healthState={source.healthState} lastStatus={source.lastStatus} />
                    </div>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 max-w-full truncate text-xs text-surface-500 hover:text-brand-600 transition-colors">
                      <span className="truncate">{source.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <p className="text-xs text-surface-500">
                      {source.lastRunAt ? `Last checked ${fmtDate(source.lastRunAt)}` : "Never checked"}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" state={syncing ? "loading" : "idle"} icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={handleSync}>
                    Sync now
                  </Button>
                </div>
              </WidgetCard>
            ))}
          </div>
        )}
      </section>

      {pricingPlans && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-surface-900">Latest pricing</h2>
          <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
            <DataTable columns={planColumns} data={pricingPlans} rowKey={(p) => p.name} emptyMessage="No pricing plans captured." />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-surface-900">Activity</h2>
        <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
          <DataTable columns={changeColumns} data={changes} rowKey={(c) => c.id} emptyMessage="No changes detected yet." />
        </div>
      </section>
    </div>
  );
}
