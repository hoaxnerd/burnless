"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal, Input, Select, useConfirm } from "@/components/ui";
import { CurrencyInput, SingleDateInput } from "@/components/forms/primitives";
import { toUserMessage } from "@/lib/api-error";

export type BonusType = "signing" | "performance" | "retention" | "other";

export interface Bonus {
  id: string;
  payoutMonth: string;
  amount: number;
  type: BonusType;
  notes?: string | null;
}

interface Props {
  headcountId: string;
  bonuses: Bonus[];
}

export function BonusesList({ headcountId, bonuses }: Props) {
  const router = useRouter();
  const { confirm: askConfirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [payoutMonth, setPayoutMonth] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [type, setType] = useState<BonusType>("performance");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...bonuses].sort((a, b) => a.payoutMonth.localeCompare(b.payoutMonth));

  function reset() {
    setPayoutMonth("");
    setAmount(null);
    setType("performance");
    setNotes("");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/headcount/${headcountId}/bonuses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payoutMonth,
          amount: amount ?? 0,
          type,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(toUserMessage(body));
        return;
      }
      close();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await askConfirm({
      title: "Delete bonus?",
      body: "This bonus will be permanently removed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await apiFetch(`/api/headcount/${headcountId}/bonuses/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(toUserMessage(body));
      return;
    }
    router.refresh();
  }

  return (
    <div data-testid="bonuses-list">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">Bonuses</h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="open-add-bonus"
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Add
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-surface-500">No bonuses recorded.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-600">
              <th className="py-2">Payout date</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Type</th>
              <th className="py-2">Notes</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.id} data-testid={`bonus-${b.id}`} className="border-t border-surface-200">
                <td className="py-2">{b.payoutMonth.slice(0, 10)}</td>
                <td className="py-2">{b.amount}</td>
                <td className="py-2">{b.type}</td>
                <td className="py-2">{b.notes ?? ""}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(b.id)}
                    data-testid={`delete-bonus-${b.id}`}
                    className="text-xs text-danger-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-danger-50 border border-danger-500/20 px-3 py-2 text-xs text-danger-600">
          {error}
        </div>
      )}

      <Modal open={open} onClose={close} title="Add bonus">
        <div className="space-y-3">
          <SingleDateInput
            label="Payout date"
            value={payoutMonth}
            onChange={setPayoutMonth}
          />
          <CurrencyInput
            label="Amount"
            value={amount ?? 0}
            onChange={(next) => setAmount(next)}
            min={0}
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as BonusType)}
            data-testid="bonus-type"
          >
            <option value="signing">Signing</option>
            <option value="performance">Performance</option>
            <option value="retention">Retention</option>
            <option value="other">Other</option>
          </Select>
          <Input
            label="Notes"
            showOptional
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="bonus-notes"
          />
          {error && (
            <div role="alert" className="rounded-lg bg-danger-50 border border-danger-500/20 px-3 py-2 text-xs text-danger-600">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-surface-300 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              data-testid="submit-bonus"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      </Modal>
      {dialog}
    </div>
  );
}
