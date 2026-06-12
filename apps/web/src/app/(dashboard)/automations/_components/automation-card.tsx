"use client";

/* ── AutomationCard — one scheduled-job row (S3a Plan 4b §B1) ─────────────────
 *
 * Pixel contract: the `.job` card in automations-management-page.html.
 * Layout: glyph tile (write→accent ✦ Sparkles; notify→highlight Bell;
 * disabled/auto_disabled→surface-300) + body (name + writes-data/notify-only
 * tag + truncated one-line prompt + meta chips: schedule, next-run relative,
 * tool count, status pill) + right cluster (on/off switch + ⋯ kebab menu).
 * A disabled job dims the card (opacity-[0.72]).
 *
 * Design-system: every color is a globals.css token utility; no raw hex, no
 * inline styles. Reuses IconButton + the status-pill token pattern.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, MoreHorizontal, Sparkles } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { describeCron } from "@/lib/automations/schedule-presets";
import type { AutomationDto, AutomationRunDto } from "@/lib/swr/hooks";

interface AutomationCardProps {
  job: AutomationDto;
  lastRun?: AutomationRunDto | null;
  onToggle: (enabled: boolean) => void;
  onRunNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

type PillTone = "success" | "warning" | "danger";

const PILL_TONES: Record<PillTone, { chip: string; dot: string }> = {
  success: { chip: "bg-success-50 text-success-600", dot: "bg-success-500" },
  warning: { chip: "bg-warning-50 text-warning-600", dot: "bg-warning-500" },
  danger: { chip: "bg-danger-50 text-danger-600", dot: "bg-danger-500" },
};

/** Map a run/job status to a {tone,label} for the status pill. */
function statusPill(
  job: AutomationDto,
  lastRun?: AutomationRunDto | null,
): { tone: PillTone; label: string } {
  const status = lastRun?.status ?? job.status;
  switch (status) {
    case "success":
    case "active":
      return { tone: "success", label: lastRun ? "Last run · success" : "Active" };
    case "failed":
    case "error":
      return { tone: "danger", label: "Failed" };
    case "missed":
      return { tone: "warning", label: "Missed" };
    case "auto_disabled":
      return { tone: "warning", label: "Auto-disabled" };
    case "disabled":
      return { tone: "warning", label: "Disabled" };
    case "running":
      return { tone: "warning", label: "Running…" };
    default:
      return { tone: "warning", label: String(status) };
  }
}

/** Coarse "in 2d / in 14h / in 30m" relative formatter (future-tense). */
function relativeFromNow(iso: string | null): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "due now";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

export function AutomationCard({
  job,
  lastRun,
  onToggle,
  onRunNow,
  onEdit,
  onDelete,
}: AutomationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const dimmed = !job.enabled || job.status === "auto_disabled" || job.status === "disabled";
  const isNotify = job.actionKind === "notify";

  const glyphTone = dimmed
    ? "bg-surface-300"
    : isNotify
      ? "bg-highlight-600"
      : "bg-accent-600";
  const GlyphIcon = isNotify ? Bell : Sparkles;

  const tag = isNotify
    ? { label: "notify only", cls: "bg-highlight-50 text-highlight-600 border border-highlight-100" }
    : { label: "writes data", cls: "bg-accent-50 text-accent-600 border border-accent-100" };

  const pill = statusPill(job, lastRun);
  const nextRun = relativeFromNow(job.nextRunAt);
  const toolCount = job.allowedTools.length;

  const chipCls =
    "flex items-center gap-1.5 rounded-lg border border-surface-200 bg-surface-50 px-2 py-1 text-[11px] tabular-nums text-surface-600";

  function handleMenu(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <div
      data-testid="automation-card"
      className={`mb-3 flex items-center gap-3.5 rounded-2xl border border-surface-200 bg-surface-0 p-4 ${
        dimmed ? "opacity-[0.72]" : ""
      }`}
    >
      <div
        className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl text-white ${glyphTone}`}
      >
        <GlyphIcon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-surface-900">{job.name}</span>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${tag.cls}`}
          >
            {tag.label}
          </span>
        </div>

        <p className="mt-0.5 max-w-[520px] truncate text-xs text-surface-500">{job.prompt}</p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={chipCls}>🗓 {describeCron(job.schedule)}</span>
          {nextRun && <span className={chipCls}>next run {nextRun}</span>}
          <span className={chipCls}>
            {toolCount} {toolCount === 1 ? "tool" : "tools"}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${PILL_TONES[pill.tone].chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${PILL_TONES[pill.tone].dot}`} />
            {pill.label}
          </span>
        </div>
      </div>

      <div className="flex flex-none items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={job.enabled}
          aria-label={job.enabled ? "Disable job" : "Enable job"}
          onClick={() => onToggle(!job.enabled)}
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

        <div ref={menuRef} className="relative">
          <IconButton
            aria-label="Job actions"
            icon={<MoreHorizontal />}
            onClick={() => setMenuOpen((o) => !o)}
          />
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-xl border border-surface-200 bg-surface-0 py-1 shadow-lg">
              <button
                type="button"
                onClick={() => handleMenu(onEdit)}
                className="block w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleMenu(onRunNow)}
                className="block w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-100"
              >
                Run now
              </button>
              <Link
                href={`/automations/${job.id}`}
                onClick={() => setMenuOpen(false)}
                className="block w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-100"
              >
                History
              </Link>
              <button
                type="button"
                onClick={() => handleMenu(onDelete)}
                className="block w-full px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
