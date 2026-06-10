"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { IconButton, useConfirm } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { toUserMessage } from "@/lib/api-error";
import { ShareClassForm } from "./share-class-form";
import { OptionPoolForm } from "./option-pool-form";
import type { ShareClassRow, OptionPoolRow } from "./cap-table-view";

/**
 * U4 — cap-table "Manage" section: editable share-class + option-pool tables.
 *
 * Cap-table structure is base-data-only (Phase 3 F §F5) — the API routes own
 * scenario safety (409 if a scenario is active) and the single-pool guard. Here
 * we mirror the single-pool guard in the UI: the "Add option pool" affordance is
 * hidden once a non-deleted pool exists. All mutations go through apiFetch (the
 * SOLE X-Scenario-Id injector — never set manually); deletes flow through the
 * themed <ConfirmDialog> via useConfirm (never a native confirm). After a write
 * we router.refresh() to re-render server data. Cap-table is currency-agnostic —
 * share counts only, rendered via toLocaleString, no currency formatting.
 */

export function CapTableManager({
  shareClasses,
  optionPools,
}: {
  shareClasses: ShareClassRow[];
  optionPools: OptionPoolRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const hasPool = optionPools.length > 0;

  async function handleDeleteShareClass(row: ShareClassRow) {
    const ok = await confirm({
      title: "Delete share class?",
      body: `“${row.name}” will be permanently removed from your capital structure.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await apiFetch(`/api/share-classes/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(toUserMessage(body));
      return;
    }
    toast.success("Share class deleted");
    router.refresh();
  }

  async function handleDeleteOptionPool(row: OptionPoolRow) {
    const ok = await confirm({
      title: "Delete option pool?",
      body: `“${row.name}” will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await apiFetch(`/api/option-pools/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(toUserMessage(body));
      return;
    }
    toast.success("Option pool deleted");
    router.refresh();
  }

  return (
    <section className="space-y-4" data-testid="cap-table-manager">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-surface-900">Manage</h2>
        <div className="flex items-center gap-2" data-testid="cap-table-toolbar">
          <ShareClassForm />
          {/* Single-pool guard: hide Add when a pool already exists. */}
          {!hasPool && <OptionPoolForm />}
        </div>
      </div>

      <div className="rounded-2xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-100">
          <h2 className="text-base font-semibold text-surface-900">Share classes</h2>
        </div>
        {shareClasses.length === 0 ? (
          <p className="px-6 py-5 text-sm text-surface-500">No share classes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Authorized
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Issued
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Liq. pref
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-surface-500 uppercase tracking-wider w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {shareClasses.map((sc) => (
                <tr
                  key={sc.id}
                  data-testid={`share-class-${sc.id}`}
                  className="hover:bg-surface-50 transition-colors"
                >
                  <td className="px-4 py-3">{sc.name}</td>
                  <td className="px-4 py-3 capitalize">{sc.classType}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(sc.totalAuthorized).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(sc.totalIssued).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {sc.liquidationPreference != null
                      ? `${Number(sc.liquidationPreference).toLocaleString()}×`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ShareClassForm existing={sc} />
                      <IconButton
                        variant="danger"
                        size="sm"
                        icon={<Trash2 />}
                        onClick={() => handleDeleteShareClass(sc)}
                        data-testid={`delete-share-class-${sc.id}`}
                        aria-label={`Delete share class ${sc.name}`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl bg-surface-0 border border-surface-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-100">
          <h2 className="text-base font-semibold text-surface-900">Option pools</h2>
        </div>
        {optionPools.length === 0 ? (
          <p className="px-6 py-5 text-sm text-surface-500">No option pool yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Reserved
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-surface-500 uppercase tracking-wider w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {optionPools.map((op) => (
                <tr
                  key={op.id}
                  data-testid={`option-pool-${op.id}`}
                  className="hover:bg-surface-50 transition-colors"
                >
                  <td className="px-4 py-3">{op.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(op.totalReserved).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <OptionPoolForm existing={op} />
                      <IconButton
                        variant="danger"
                        size="sm"
                        icon={<Trash2 />}
                        onClick={() => handleDeleteOptionPool(op)}
                        data-testid={`delete-option-pool-${op.id}`}
                        aria-label={`Delete option pool ${op.name}`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog}
    </section>
  );
}
