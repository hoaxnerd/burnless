"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  GitBranch,
  Play,
  Square,
  BarChart3,
  Copy,
  MoreHorizontal,
  Trash2,
  Clock,
  Shield,
  History,
} from "lucide-react";
import { useScenario } from "@/components/scenarios/scenario-context";
import { ScenarioBadge } from "@/components/scenarios/scenario-badge";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/locale/locale-context";
import { apiFetch } from "@/lib/api-fetch";
import type { ScenarioItem } from "./scenarios-view";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/* ── Dropdown menu ────────────────────────────────────────────────────── */

function DropdownMenu({
  children,
  open,
  onClose,
}: {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-surface-200 bg-surface-0 py-1 shadow-lg"
    >
      {children}
    </div>
  );
}

function DropdownItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-3 py-1.5 text-left text-xs font-medium transition-colors disabled:opacity-50 ${
        danger
          ? "text-danger-600 hover:bg-danger-50"
          : "text-surface-700 hover:bg-surface-50"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */

export function ScenarioCards({ scenarios }: { scenarios: ScenarioItem[] }) {
  const { activeScenarioId, enterScenario, exitScenario } = useScenario();
  const { fmtDate } = useLocale();
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [keepingId, setKeepingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  /* ── Actions ─────────────────────────────────────────────────────── */

  const duplicateScenario = async (id: string) => {
    setDuplicatingId(id);
    try {
      const res = await apiFetch(`/api/scenarios/${id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to duplicate scenario");
      }
      toast.success("Scenario duplicated");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to duplicate scenario"
      );
    } finally {
      setDuplicatingId(null);
    }
  };

  const deleteScenario = async (id: string) => {
    setDeletingId(id);
    setMenuOpenId(null);
    try {
      const res = await apiFetch(`/api/scenarios/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete scenario");
      }
      toast.success("Scenario deleted");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete scenario"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const keepForever = async (id: string) => {
    setKeepingId(id);
    try {
      const res = await apiFetch(`/api/scenarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoDeleteAt: null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update scenario");
      }
      toast.success("Backup will be kept forever");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update scenario"
      );
    } finally {
      setKeepingId(null);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 4
          ? [...prev, id]
          : prev
    );
  };

  /* ── Group scenarios by status ──────────────────────────────────── */

  // Backups always go to their own section regardless of status
  const backupScenarios = scenarios.filter((s) => s.source === "backup");
  const nonBackup = scenarios.filter((s) => s.source !== "backup");
  const activeScenarios = nonBackup.filter((s) => s.status === "active");
  const promotedScenarios = nonBackup.filter((s) => s.status === "promoted");
  const archivedScenarios = nonBackup.filter((s) => s.status === "archived");

  /* ── Empty state ────────────────────────────────────────────────── */

  if (scenarios.length === 0) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <div className="mx-auto max-w-md">
          <div className="text-4xl mb-4">
            <GitBranch className="h-12 w-12 mx-auto text-surface-300" />
          </div>
          <h3 className="text-lg font-semibold text-surface-900 mb-2">
            No scenarios yet
          </h3>
          <p className="text-sm text-surface-500 mb-6">
            Create your first scenario to start modeling different outcomes for
            your business — best case, worst case, and everything in between.
          </p>
        </div>
      </div>
    );
  }

  /* ── Render a scenario card ─────────────────────────────────────── */

  function renderCard(scenario: ScenarioItem) {
    const isActive = activeScenarioId === scenario.id;
    const isComparing = compareIds.includes(scenario.id);
    const isBackup = scenario.source === "backup";
    const isPromoted = scenario.status === "promoted";
    const isArchived = scenario.status === "archived";

    return (
      <div
        key={scenario.id}
        className={`relative rounded-xl bg-surface-0 border p-6 transition-all ${
          isBackup
            ? "border-dashed border-surface-300 opacity-80"
            : isPromoted || isArchived
              ? "border-surface-200 opacity-60"
              : isActive
                ? "border-amber-400 shadow-sm ring-1 ring-amber-200"
                : isComparing
                  ? "border-brand-300 shadow-sm ring-1 ring-brand-200"
                  : "border-surface-200 hover:border-brand-300 hover:shadow-sm"
        }`}
      >
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3
              className={`text-sm font-semibold truncate ${
                isPromoted || isArchived
                  ? "text-surface-500"
                  : "text-surface-900"
              }`}
            >
              {scenario.name}
            </h3>

            {/* Badges */}
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <ScenarioBadge variant="source" value={scenario.source} />
              {scenario.status !== "active" && (
                <ScenarioBadge variant="status" value={scenario.status} />
              )}
              {scenario.overrideCount > 0 && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-50">
                  {scenario.overrideCount}{" "}
                  {scenario.overrideCount === 1 ? "change" : "changes"}
                </span>
              )}
            </div>
          </div>

          {/* Right side — active indicator or menu */}
          <div className="flex items-center gap-1 ml-2">
            {isActive && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Active
              </span>
            )}

            {/* "..." menu for active/normal scenarios */}
            {scenario.status === "active" && !isBackup && (
              <div className="relative">
                <button
                  onClick={() =>
                    setMenuOpenId(
                      menuOpenId === scenario.id ? null : scenario.id
                    )
                  }
                  className="rounded-lg p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                <DropdownMenu
                  open={menuOpenId === scenario.id}
                  onClose={() => setMenuOpenId(null)}
                >
                  <DropdownItem
                    onClick={() => {
                      setMenuOpenId(null);
                      deleteScenario(scenario.id);
                    }}
                    danger
                    disabled={deletingId === scenario.id}
                  >
                    <span className="flex items-center gap-2">
                      <Trash2 className="h-3 w-3" />
                      {deletingId === scenario.id ? "Deleting..." : "Delete"}
                    </span>
                  </DropdownItem>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {scenario.description && (
          <p
            className={`mt-2 text-xs ${
              isPromoted || isArchived ? "text-surface-400" : "text-surface-500"
            }`}
          >
            {scenario.description}
          </p>
        )}

        {/* Backup auto-delete countdown */}
        {isBackup && scenario.autoDeleteAt && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-warning-600">
            <Clock className="h-3 w-3" />
            <span>Auto-deletes in {daysUntil(scenario.autoDeleteAt)} days</span>
          </div>
        )}

        {/* Meta */}
        <p
          className={`mt-3 text-xs ${
            isPromoted || isArchived ? "text-surface-300" : "text-surface-400"
          }`}
        >
          Created {fmtDate(scenario.createdAt)}
        </p>

        {/* Actions — vary by status/source */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {/* Backup scenarios: Keep Forever + Delete */}
          {isBackup && (
            <>
              {scenario.autoDeleteAt && (
                <button
                  onClick={() => keepForever(scenario.id)}
                  disabled={keepingId === scenario.id}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-100 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-200 transition-colors disabled:opacity-50"
                >
                  <Shield className="h-3 w-3" />
                  {keepingId === scenario.id ? "Saving..." : "Keep Forever"}
                </button>
              )}
              <button
                onClick={() => deleteScenario(scenario.id)}
                disabled={deletingId === scenario.id}
                className="flex items-center gap-1.5 rounded-lg bg-danger-50 px-3 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-100 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                {deletingId === scenario.id ? "Deleting..." : "Delete"}
              </button>
            </>
          )}

          {/* Promoted scenarios: View History only */}
          {isPromoted && !isBackup && (
            <Link
              href={`/scenarios/compare?ids=${scenario.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-surface-100 px-3 py-1.5 text-xs font-medium text-surface-500 hover:bg-surface-200 transition-colors"
            >
              <History className="h-3 w-3" />
              View History
            </Link>
          )}

          {/* Archived (non-backup): just a view action */}
          {isArchived && !isBackup && !isPromoted && (
            <Link
              href={`/scenarios/compare?ids=${scenario.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-surface-100 px-3 py-1.5 text-xs font-medium text-surface-500 hover:bg-surface-200 transition-colors"
            >
              <History className="h-3 w-3" />
              View History
            </Link>
          )}

          {/* Active scenarios: Enter, Compare, Duplicate, (Delete in menu) */}
          {scenario.status === "active" && !isBackup && (
            <>
              {isActive ? (
                <button
                  onClick={exitScenario}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-200 transition-colors"
                >
                  <Square className="h-3 w-3" />
                  Exit sandbox
                </button>
              ) : (
                <button
                  onClick={() => enterScenario(scenario.id, scenario.name)}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                >
                  <Play className="h-3 w-3" />
                  Enter sandbox
                </button>
              )}

              <button
                onClick={() => toggleCompare(scenario.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isComparing
                    ? "bg-brand-100 text-brand-700 hover:bg-brand-200"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                }`}
              >
                <BarChart3 className="h-3 w-3" />
                {isComparing ? "Selected" : "Compare"}
              </button>

              <button
                onClick={() => duplicateScenario(scenario.id)}
                disabled={duplicatingId === scenario.id}
                className="flex items-center gap-1.5 rounded-lg bg-surface-100 px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-200 transition-colors disabled:opacity-50"
              >
                <Copy className="h-3 w-3" />
                {duplicatingId === scenario.id ? "Duplicating..." : "Duplicate"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── Layout ─────────────────────────────────────────────────────── */

  return (
    <div>
      {/* Compare bar */}
      {compareIds.length >= 2 && (
        <div className="mb-6 rounded-lg bg-brand-50 border border-brand-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-brand-800">
              {compareIds.length} scenarios selected for comparison
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCompareIds([])}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Clear
            </button>
            <Link
              href={`/scenarios/compare?ids=${compareIds.join(",")}`}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Compare scenarios
            </Link>
          </div>
        </div>
      )}

      {/* Active scenarios */}
      {activeScenarios.length > 0 && (
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeScenarios.map(renderCard)}
          </div>
        </div>
      )}

      {/* Promoted scenarios */}
      {promotedScenarios.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Promoted
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {promotedScenarios.map(renderCard)}
          </div>
        </div>
      )}

      {/* Archived scenarios (non-backup) */}
      {archivedScenarios.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Archived
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {archivedScenarios.map(renderCard)}
          </div>
        </div>
      )}

      {/* Backups */}
      {backupScenarios.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
            Backups
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {backupScenarios.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  );
}
