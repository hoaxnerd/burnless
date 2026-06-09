"use client";

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Button, useConfirm } from "@/components/ui";
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

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-surface-700">Share classes</h3>
        {shareClasses.length === 0 ? (
          <p className="text-sm text-muted">No share classes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left text-xs text-surface-600">
                <th className="p-2">Name</th>
                <th className="p-2">Type</th>
                <th className="p-2 text-right">Authorized</th>
                <th className="p-2 text-right">Issued</th>
                <th className="p-2 text-right">Liq. pref</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {shareClasses.map((sc) => (
                <tr
                  key={sc.id}
                  data-testid={`share-class-${sc.id}`}
                  className="border-b border-surface-200"
                >
                  <td className="p-2">{sc.name}</td>
                  <td className="p-2 capitalize">{sc.classType}</td>
                  <td className="p-2 text-right">
                    {Number(sc.totalAuthorized).toLocaleString()}
                  </td>
                  <td className="p-2 text-right">
                    {Number(sc.totalIssued).toLocaleString()}
                  </td>
                  <td className="p-2 text-right">
                    {sc.liquidationPreference != null
                      ? `${Number(sc.liquidationPreference).toLocaleString()}×`
                      : "—"}
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <ShareClassForm existing={sc} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteShareClass(sc)}
                        data-testid={`delete-share-class-${sc.id}`}
                        aria-label={`Delete share class ${sc.name}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-surface-700">Option pools</h3>
        {optionPools.length === 0 ? (
          <p className="text-sm text-muted">No option pool yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left text-xs text-surface-600">
                <th className="p-2">Name</th>
                <th className="p-2 text-right">Reserved</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {optionPools.map((op) => (
                <tr
                  key={op.id}
                  data-testid={`option-pool-${op.id}`}
                  className="border-b border-surface-200"
                >
                  <td className="p-2">{op.name}</td>
                  <td className="p-2 text-right">
                    {Number(op.totalReserved).toLocaleString()}
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <OptionPoolForm existing={op} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteOptionPool(op)}
                        data-testid={`delete-option-pool-${op.id}`}
                        aria-label={`Delete option pool ${op.name}`}
                      >
                        Delete
                      </Button>
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
