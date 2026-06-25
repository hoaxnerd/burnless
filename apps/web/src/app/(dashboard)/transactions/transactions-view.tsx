"use client";

/**
 * Transactions browse + manage table. Lightweight DataTable (not the metric grid).
 * Columns: Date · Account · Description · Vendor · Amount · Source. Filters: account
 * Select + two date Inputs. Cursor pagination via "Load more". Manual rows get
 * Edit (modal) + Delete (useConfirm); source!=='manual' rows are read-only. When a
 * scenario is active the whole surface is read-only (§3) with a one-line notice —
 * the REST routes enforce it regardless; this hides the affordances.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { DataTable, Button, Input, Select, useConfirm } from "@/components/ui";
import { useLocale } from "@/components/locale/locale-context";
import { useTransactions, type TransactionRow, type TransactionsPayload } from "@/lib/swr";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import { TransactionFormModal, type TransactionFormRow } from "./transaction-form-modal";

interface TransactionsViewProps {
  companyId: string;
  accounts: Array<{ id: string; name: string }>;
  initialData: TransactionsPayload;
  scenarioActive: boolean;
}

/** Reuse-only source pill — no @/components/ui badge component exists, so a
 *  token-styled <span> (matches the expense-table flag pills). NOT a new component. */
function SourcePill({ source }: { source: TransactionRow["source"] }) {
  const cls =
    source === "manual"
      ? "bg-surface-100 text-surface-600"
      : source === "import"
        ? "bg-blue-50 text-blue-600"
        : source === "integration"
          ? "bg-violet-50 text-violet-600"
          : "bg-amber-50 text-amber-600";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase ${cls}`}>
      {source}
    </span>
  );
}

export function TransactionsView({ companyId: _companyId, accounts, initialData, scenarioActive }: TransactionsViewProps) {
  const router = useRouter();
  const { fmtCurrency, fmtDate } = useLocale();
  const { confirm, dialog } = useConfirm();

  const [accountId, setAccountId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      accountId: accountId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      cursor,
    }),
    [accountId, startDate, endDate, cursor],
  );

  // Seed the first page from SSR; only the unfiltered/first-cursor key matches the
  // server fetch, so fallbackData applies cleanly and changing a filter refetches.
  const { data } = useTransactions(filters, { fallbackData: initialData });
  const rows = data?.data ?? [];
  const pagination = data?.pagination ?? { hasMore: false, nextCursor: null, count: 0 };

  const accountName = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: string) => m.get(id) ?? id;
  }, [accounts]);

  async function handleDelete(row: TransactionRow) {
    const ok = await confirm({
      title: "Delete transaction",
      body: `Delete "${row.description ?? accountName(row.accountId)}"? This permanently removes the actual.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setActionError(null);
    try {
      const res = await apiFetch(`/api/transactions/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete transaction");
      }
      router.refresh();
    } catch (err) {
      setActionError(toUserMessage(err));
    }
  }

  const columns = [
    { key: "date", header: "Date", render: (r: TransactionRow) => fmtDate(r.date), sortValue: (r: TransactionRow) => r.date },
    { key: "account", header: "Account", render: (r: TransactionRow) => accountName(r.accountId) },
    { key: "description", header: "Description", render: (r: TransactionRow) => r.description ?? "—" },
    { key: "vendor", header: "Vendor", render: (r: TransactionRow) => r.vendor ?? "—" },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      render: (r: TransactionRow) => <span className="tabular-nums">{fmtCurrency(Number(r.amount))}</span>,
      sortValue: (r: TransactionRow) => Number(r.amount),
    },
    { key: "source", header: "Source", render: (r: TransactionRow) => <SourcePill source={r.source} /> },
    {
      key: "actions",
      header: "",
      align: "right" as const,
      render: (r: TransactionRow) =>
        scenarioActive || r.source !== "manual" ? null : (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setEditing(r)}
              className="rounded-md p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="Edit transaction"
              title="Edit transaction"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleDelete(r)}
              className="rounded-md p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              aria-label="Delete transaction"
              title="Delete transaction"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Transactions</h1>
          <p className="mt-1 text-sm text-surface-500">Your actuals ledger</p>
        </div>
        {!scenarioActive && <TransactionFormModal mode="add" accounts={accounts} />}
      </div>

      {scenarioActive && (
        <div className="rounded-lg bg-warning-50 border border-warning-500/20 px-4 py-3 text-sm text-warning-700" role="status">
          Transactions are actuals — switch to base view to add or edit.
        </div>
      )}

      {actionError && (
        <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600" role="alert">
          {actionError}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="tx-filter-account" className="block text-xs font-medium text-surface-500 mb-1">Account</label>
          <Select id="tx-filter-account" value={accountId} onChange={(e) => { setAccountId(e.target.value); setCursor(undefined); }}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="tx-filter-start" className="block text-xs font-medium text-surface-500 mb-1">From</label>
          <Input id="tx-filter-start" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setCursor(undefined); }} />
        </div>
        <div>
          <label htmlFor="tx-filter-end" className="block text-xs font-medium text-surface-500 mb-1">To</label>
          <Input id="tx-filter-end" type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setCursor(undefined); }} />
        </div>
      </div>

      <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          emptyMessage="No transactions yet. Add one to start your ledger."
        />
      </div>

      {pagination.hasMore && pagination.nextCursor && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setCursor(pagination.nextCursor ?? undefined)}>Load more</Button>
        </div>
      )}

      {editing && (
        <TransactionFormModal
          mode="edit"
          accounts={accounts}
          open={!!editing}
          onClose={() => setEditing(null)}
          initialValue={
            {
              id: editing.id,
              accountId: editing.accountId,
              date: editing.date,
              amount: editing.amount,
              description: editing.description,
              vendor: editing.vendor,
              notes: editing.notes,
            } satisfies TransactionFormRow
          }
        />
      )}

      {dialog}
    </div>
  );
}
