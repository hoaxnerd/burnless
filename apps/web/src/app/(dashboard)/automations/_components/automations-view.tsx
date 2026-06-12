"use client";

/* ── AutomationsView — the /automations management list (S3a Plan 4b §B2) ─────
 *
 * Pixel contract: automations-management-page.html (page header + job-card list).
 * Client surface: useAutomations() → header (title + subtitle + "＋ New job"
 * link to /ai, the chat-first create flow) + the list of <AutomationCard>s, or
 * an <EmptyState> (Clock icon) when there are no jobs.
 *
 * Card handlers fire-and-mutate via apiFetch:
 *   onToggle(enabled) → PATCH /api/automations/[id] { enabled }
 *   onRunNow          → POST  /api/automations/[id]/run
 *   onDelete          → window.confirm → DELETE /api/automations/[id]
 *   onEdit            → open <AutomationEditModal>; onSave(patch) → PATCH + mutate
 *
 * Design-system: token utilities + primitives only. The "＋ New job" pill mirrors
 * the brand-600 button token classes (Button is a <button>, so a styled Link is
 * used for navigation — matches the EmptyState CTA precedent).
 */

import { useState } from "react";
import Link from "next/link";
import { Clock, Plus } from "lucide-react";
import { useAutomations } from "@/lib/swr/hooks";
import type { AutomationDto } from "@/lib/swr/hooks";
import { apiFetch } from "@/lib/api-fetch";
import { PageEmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { AutomationCard } from "./automation-card";
import { AutomationEditModal, type AutomationEditPatch } from "./automation-edit-modal";

export function AutomationsView() {
  const { data, mutate, isLoading } = useAutomations();
  const [editing, setEditing] = useState<AutomationDto | null>(null);

  const jobs = data?.jobs ?? [];

  async function onToggle(id: string, enabled: boolean) {
    await apiFetch(`/api/automations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    await mutate();
  }

  async function onRunNow(id: string) {
    await apiFetch(`/api/automations/${id}/run`, { method: "POST" });
    await mutate();
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this automation? This can't be undone.")) return;
    await apiFetch(`/api/automations/${id}`, { method: "DELETE" });
    await mutate();
  }

  async function onSaveEdit(id: string, patch: AutomationEditPatch) {
    await apiFetch(`/api/automations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await mutate();
    setEditing(null);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-surface-900 sm:text-2xl">
            Automations
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            Scheduled tasks your Companion runs unattended. Set &amp; forget — every run is
            logged and notified.
          </p>
        </div>
        <Link
          href="/ai"
          className="inline-flex flex-none items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New job
        </Link>
      </div>

      {isLoading && jobs.length === 0 ? (
        <PageSkeleton />
      ) : jobs.length === 0 ? (
        <PageEmptyState
          icon={Clock}
          title="No automations yet"
          description="Ask the Companion to schedule a recurring task — like a weekly revenue sync or a daily cash digest — and it runs unattended, every run logged and notified."
          ctaLabel="Ask the Companion"
          ctaHref="/ai"
        />
      ) : (
        <div>
          {jobs.map((job) => (
            <AutomationCard
              key={job.id}
              job={job}
              onToggle={(enabled) => void onToggle(job.id, enabled)}
              onRunNow={() => void onRunNow(job.id)}
              onEdit={() => setEditing(job)}
              onDelete={() => void onDelete(job.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <AutomationEditModal
          open={true}
          job={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => onSaveEdit(editing.id, patch)}
        />
      )}
    </div>
  );
}
