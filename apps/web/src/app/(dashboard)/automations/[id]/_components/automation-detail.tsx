"use client";

/* ── AutomationDetail — /automations/[id] detail + run-history (S3a Plan 4b §B4)
 *
 * Client surface: useAutomation(id) → header (job name, humanized schedule,
 * status pill, Run now + Edit buttons, on/off switch) + a run-history timeline.
 * Each run row: relative startedAt, status pill (success→success, failed→danger,
 * missed/running→warning), duration (`${ms}ms` or `s` ≥1000), tokens, summary;
 * expandable to show output/error. Empty runs → "No runs yet."
 *
 * Actions fire-and-mutate via apiFetch:
 *   Run now → POST /api/automations/[id]/run        → mutate()
 *   Edit    → <AutomationEditModal>; onSave(patch)  → PATCH /api/automations/[id] → mutate()
 *   Toggle  → PATCH /api/automations/[id] { enabled } → mutate()
 *
 * Design-system: token utilities + primitives only; no raw hex, no inline styles.
 * The run-history rail replicates the chat TimelineView (pl-6, bg-surface-200
 * vertical line, ring-surface-0 dots) with tokens — it does NOT import the chat
 * component. Status-pill tones mirror AutomationCard.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { PageEmptyState } from "@/components/ui/empty-state";
import { Clock } from "lucide-react";
import { describeCron } from "@/lib/automations/schedule-presets";
import { apiFetch } from "@/lib/api-fetch";
import { useAutomation } from "@/lib/swr/hooks";
import type { AutomationDto, AutomationRunDto } from "@/lib/swr/hooks";
import { AutomationEditModal, type AutomationEditPatch } from "../../_components/automation-edit-modal";

type PillTone = "success" | "warning" | "danger";

const PILL_TONES: Record<PillTone, { chip: string; dot: string }> = {
  success: { chip: "bg-success-50 text-success-600", dot: "bg-success-500" },
  warning: { chip: "bg-warning-50 text-warning-600", dot: "bg-warning-500" },
  danger: { chip: "bg-danger-50 text-danger-600", dot: "bg-danger-500" },
};

/** Map a job status (active/disabled/auto_disabled/error) to a pill tone+label. */
function jobStatusPill(job: AutomationDto): { tone: PillTone; label: string } {
  switch (job.status) {
    case "active":
      return { tone: "success", label: "Active" };
    case "error":
      return { tone: "danger", label: "Error" };
    case "auto_disabled":
      return { tone: "warning", label: "Auto-disabled" };
    case "disabled":
    default:
      return { tone: "warning", label: "Disabled" };
  }
}

/** Map a run status to a pill tone+label. */
function runStatusPill(status: AutomationRunDto["status"]): { tone: PillTone; label: string } {
  switch (status) {
    case "success":
      return { tone: "success", label: "Success" };
    case "failed":
      return { tone: "danger", label: "Failed" };
    case "missed":
      return { tone: "warning", label: "Missed" };
    case "running":
    default:
      return { tone: "warning", label: "Running…" };
  }
}

/** Format a duration in ms: `${ms}ms` under a second, else `${s}s` (≥1000). */
function formatDuration(ms: number | null): string | null {
  if (ms == null) return null;
  if (ms >= 1000) {
    const s = ms / 1000;
    return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
  }
  return `${ms}ms`;
}

/** Coarse past-tense relative formatter: "just now / 5m ago / 3h ago / 2d ago". */
function relativePast(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 60000) return "just now";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function StatusPill({ tone, label }: { tone: PillTone; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${PILL_TONES[tone].chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${PILL_TONES[tone].dot}`} />
      {label}
    </span>
  );
}

function RunRow({ run }: { run: AutomationRunDto }) {
  const [expanded, setExpanded] = useState(false);
  const pill = runStatusPill(run.status);
  const when = relativePast(run.startedAt);
  const duration = formatDuration(run.durationMs);
  const hasDetails = run.output != null || run.error != null;

  const metaChip =
    "inline-flex items-center rounded-lg border border-surface-200 bg-surface-50 px-2 py-0.5 text-[11px] tabular-nums text-surface-600";

  return (
    <li className="relative">
      <span
        aria-hidden
        className={`absolute -left-6 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-surface-0 ${PILL_TONES[pill.tone].dot}`}
      />
      <div className="rounded-2xl border border-surface-200 bg-surface-0 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {when && <span className="text-sm font-semibold text-surface-900">{when}</span>}
          <StatusPill tone={pill.tone} label={pill.label} />
          {duration && <span className={metaChip}>{duration}</span>}
          {run.tokensUsed != null && (
            <span className={metaChip}>
              {run.tokensUsed.toLocaleString()} {run.tokensUsed === 1 ? "token" : "tokens"}
            </span>
          )}
        </div>

        {run.summary && <p className="mt-2 text-sm text-surface-600">{run.summary}</p>}

        {hasDetails && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((o) => !o)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-surface-500 hover:text-surface-700"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {expanded ? "Hide details" : "Show details"}
            </button>
            {expanded && (
              <div className="mt-2 flex flex-col gap-2">
                {run.error && (
                  <pre className="overflow-x-auto rounded-xl border border-danger-100 bg-danger-50 p-3 text-xs text-danger-600">
                    {run.error}
                  </pre>
                )}
                {run.output != null && (
                  <pre className="overflow-x-auto rounded-xl border border-surface-200 bg-surface-50 p-3 font-mono text-xs text-surface-700">
                    {JSON.stringify(run.output, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function AutomationDetail({ id }: { id: string }) {
  const { data, mutate, isLoading } = useAutomation(id);
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState(false);

  if (isLoading && !data) return <PageSkeleton />;
  if (!data) {
    return (
      <PageEmptyState
        icon={Clock}
        title="Automation not found"
        description="This automation may have been deleted."
        ctaLabel="Back to Automations"
        ctaHref="/automations"
      />
    );
  }

  const { job, runs } = data;
  const pill = jobStatusPill(job);

  async function runNow() {
    setRunning(true);
    try {
      await apiFetch(`/api/automations/${id}/run`, { method: "POST" });
      await mutate();
    } finally {
      setRunning(false);
    }
  }

  async function toggle(enabled: boolean) {
    await apiFetch(`/api/automations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    await mutate();
  }

  async function saveEdit(patch: AutomationEditPatch) {
    await apiFetch(`/api/automations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await mutate();
    setEditing(false);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-surface-900 sm:text-2xl">
              {job.name}
            </h1>
            <StatusPill tone={pill.tone} label={pill.label} />
          </div>
          <p className="mt-1 text-sm text-surface-500">🗓 {describeCron(job.schedule)}</p>
        </div>

        <div className="flex flex-none items-center gap-3">
          <Button
            variant="ghost"
            icon={<Play className="h-4 w-4" />}
            onClick={() => void runNow()}
            state={running ? "loading" : "idle"}
          >
            Run now
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <button
            type="button"
            role="switch"
            aria-checked={job.enabled}
            aria-label={job.enabled ? "Disable job" : "Enable job"}
            onClick={() => void toggle(!job.enabled)}
            className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${
              job.enabled ? "bg-brand-600" : "bg-surface-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-surface-0 shadow-sm transition-all ${
                job.enabled ? "right-0.5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-bold text-surface-900">Run history</h2>

      {runs.length === 0 ? (
        <p className="rounded-2xl border border-surface-200 bg-surface-0 p-8 text-center text-sm text-surface-500">
          No runs yet.
        </p>
      ) : (
        <ol className="relative flex flex-col gap-3 pl-6">
          <span aria-hidden className="absolute left-[7px] top-1 bottom-1 w-px bg-surface-200" />
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ol>
      )}

      {editing && (
        <AutomationEditModal
          open={true}
          job={job}
          onClose={() => setEditing(false)}
          onSave={(patch) => saveEdit(patch)}
        />
      )}
    </div>
  );
}
