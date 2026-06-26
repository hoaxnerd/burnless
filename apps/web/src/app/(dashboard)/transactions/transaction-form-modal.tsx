"use client";

/**
 * Add/edit modal for a MANUAL transaction. Submits to POST /api/transactions
 * (add) or PATCH /api/transactions/[id] (edit) via apiFetch, then router.refresh().
 * Manual-only: the view never opens this for source!=='manual' rows. Mirrors the
 * expense-form-modal add/edit discriminated-union shape, kept self-contained since
 * this surface is simpler (flat fields, no forecast method machinery).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal, Input, Select, Button } from "@/components/ui";
import { toUserMessage } from "@/lib/api-error";
import { submitCreateOrUpdate } from "@/lib/submit-create-or-update";

export interface TransactionFormRow {
  id: string;
  accountId: string;
  date: string;
  amount: string;
  description: string | null;
  vendor: string | null;
  notes: string | null;
}

interface CommonProps {
  accounts: Array<{ id: string; name: string }>;
}
type AddProps = CommonProps & { mode: "add" };
type EditProps = CommonProps & { mode: "edit"; initialValue: TransactionFormRow; open: boolean; onClose: () => void };
export type TransactionFormModalProps = AddProps | EditProps;

/** Format an ISO/Date string as YYYY-MM-DD for <input type="date">. */
function toDateInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function TransactionFormModal(props: TransactionFormModalProps) {
  const router = useRouter();
  const { accounts } = props;
  const isAdd = props.mode === "add";

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isAdd ? internalOpen : props.open;
  const close = isAdd ? () => setInternalOpen(false) : props.onClose;

  const init = isAdd ? null : props.initialValue;
  const [accountId, setAccountId] = useState<string>(init?.accountId ?? accounts[0]?.id ?? "");
  const [date, setDate] = useState<string>(toDateInput(init?.date ?? null) || toDateInput(new Date().toISOString()));
  const [amount, setAmount] = useState<string>(init ? String(Number(init.amount)) : "");
  const [description, setDescription] = useState<string>(init?.description ?? "");
  const [vendor, setVendor] = useState<string>(init?.vendor ?? "");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = accountId !== "" && date !== "" && amount !== "" && Number(amount) >= 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValid) {
      setError("Account, date and a non-negative amount are required.");
      return;
    }
    const payload = {
      accountId,
      date,
      amount: Number(amount),
      description: description.trim() === "" ? null : description.trim(),
      vendor: vendor.trim() === "" ? null : vendor.trim(),
    };
    setSubmitting(true);
    try {
      await submitCreateOrUpdate({
        basePath: "/api/transactions",
        id: isAdd ? null : (props as EditProps).initialValue.id,
        payload,
        entityLabel: "transaction",
      });
      close();
      router.refresh();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {isAdd && (
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setInternalOpen(true)}>
          Add Transaction
        </Button>
      )}
      <Modal open={open} onClose={close} title={isAdd ? "Add Transaction" : "Edit Transaction"}>
        <form onSubmit={handleSubmit} className="space-y-4" aria-label={isAdd ? "Add transaction" : "Edit transaction"}>
          {error && (
            <div className="rounded-lg bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600" role="alert">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="tx-account" className="block text-sm font-medium text-surface-700 mb-1">Account</label>
            <Select id="tx-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="tx-date" className="block text-sm font-medium text-surface-700 mb-1">Date</label>
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="tx-amount" className="block text-sm font-medium text-surface-700 mb-1">Amount</label>
              <Input id="tx-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label htmlFor="tx-description" className="block text-sm font-medium text-surface-700 mb-1">
              Description <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <Input id="tx-description" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Office supplies" />
          </div>
          <div>
            <label htmlFor="tx-vendor" className="block text-sm font-medium text-surface-700 mb-1">
              Vendor <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <Input id="tx-vendor" type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. AWS" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={close} disabled={submitting}>Cancel</Button>
            <Button type="submit" state={submitting ? "loading" : "idle"} disabled={!isValid}>
              {isAdd ? "Add Transaction" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
