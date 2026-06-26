"use client";

/**
 * Chart-of-accounts management table. Lightweight DataTable (not the metric grid).
 * Columns: Name · Type · Category · Covers headcount · # Transactions · actions.
 * Create/Edit via AccountFormModal. Delete is guarded HARD (§0.3): the affordance
 * is enabled only for clean, non-system accounts (!isSystem && transactionCount === 0).
 * Otherwise a disabled control renders with a `title` tooltip explaining why (the
 * transactions.accountId FK is CASCADE, so deleting a non-empty account would
 * silently delete its transactions). The server enforces the same guard regardless.
 * Nested route — back-link to /transactions (CapTable nesting precedent).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { DataTable, useConfirm } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import type { FinancialAccount } from "@/lib/swr";
import { AccountFormModal, type AccountFormRow } from "./account-form-modal";

export function AccountsView({ accounts }: { accounts: FinancialAccount[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDelete(a: FinancialAccount) {
    const ok = await confirm({
      title: "Delete account",
      body: `Delete "${a.name}"? This permanently removes the account from your chart of accounts.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setActionError(null);
    try {
      const res = await apiFetch(`/api/accounts/${a.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete account");
      }
      router.refresh();
    } catch (err) {
      setActionError(toUserMessage(err));
    }
  }

  const columns = [
    { key: "name", header: "Name", render: (a: FinancialAccount) => a.name, sortValue: (a: FinancialAccount) => a.name },
    { key: "type", header: "Type", render: (a: FinancialAccount) => a.type },
    { key: "category", header: "Category", render: (a: FinancialAccount) => a.category.replace(/_/g, " ") },
    {
      key: "coversHeadcount",
      header: "Covers headcount",
      render: (a: FinancialAccount) => (a.coversHeadcount ? "Yes" : "—"),
    },
    {
      key: "transactionCount",
      header: "# Transactions",
      align: "right" as const,
      render: (a: FinancialAccount) => <span className="tabular-nums">{a.transactionCount}</span>,
      sortValue: (a: FinancialAccount) => a.transactionCount,
    },
    {
      key: "actions",
      header: "",
      align: "right" as const,
      render: (a: FinancialAccount) => {
        const deletable = !a.isSystem && a.transactionCount === 0;
        const blockReason = a.isSystem
          ? "System accounts can't be deleted."
          : a.transactionCount > 0
            ? "Reassign or remove this account's transactions before deleting it."
            : "Delete account";
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setEditing(a)}
              className="rounded-md p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="Edit account"
              title="Edit account"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {deletable ? (
              <button
                onClick={() => handleDelete(a)}
                className="rounded-md p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                aria-label="Delete account"
                title="Delete account"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                disabled
                className="rounded-md p-1.5 text-surface-200 cursor-not-allowed"
                aria-label="Delete account (unavailable)"
                title={blockReason}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Transactions
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Accounts</h1>
            <p className="mt-1 text-sm text-surface-500">Your chart of accounts</p>
          </div>
          <AccountFormModal mode="add" />
        </div>
      </header>

      {actionError && (
        <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600" role="alert">
          {actionError}
        </div>
      )}

      <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
        <DataTable
          columns={columns}
          data={accounts}
          rowKey={(a) => a.id}
          emptyMessage="No accounts yet."
        />
      </div>

      {editing && (
        <AccountFormModal
          mode="edit"
          open={!!editing}
          onClose={() => setEditing(null)}
          initialValue={
            {
              id: editing.id,
              name: editing.name,
              type: editing.type,
              category: editing.category,
              coversHeadcount: editing.coversHeadcount,
            } satisfies AccountFormRow
          }
        />
      )}

      {dialog}
    </div>
  );
}
