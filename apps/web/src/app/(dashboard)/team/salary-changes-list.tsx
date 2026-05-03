"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal } from "@/components/ui";

export interface SalaryChange {
  id: string;
  effectiveDate: string;
  newSalary: number;
  reason?: string | null;
}

interface Props {
  headcountId: string;
  scenarioId: string;
  changes: SalaryChange[];
}

export function SalaryChangesList({ headcountId, scenarioId, changes }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [newSalary, setNewSalary] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...changes].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate),
  );

  function reset() {
    setEffectiveDate("");
    setNewSalary("");
    setReason("");
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
      const res = await apiFetch(`/api/headcount/${headcountId}/salary-changes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Scenario-Id": scenarioId,
        },
        body: JSON.stringify({
          effectiveDate,
          newSalary: parseFloat(newSalary),
          reason: reason || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to save");
        return;
      }
      close();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this salary change?")) return;
    const res = await apiFetch(
      `/api/headcount/${headcountId}/salary-changes/${id}`,
      {
        method: "DELETE",
        headers: { "X-Scenario-Id": scenarioId },
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to delete");
      return;
    }
    router.refresh();
  }

  return (
    <div data-testid="salary-changes-list">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">Salary changes</h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="open-add-salary-change"
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Add
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-surface-500">No salary changes recorded.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-600">
              <th className="py-2">Effective</th>
              <th className="py-2">New salary</th>
              <th className="py-2">Reason</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} data-testid={`salary-change-${c.id}`} className="border-t border-surface-200">
                <td className="py-2">{c.effectiveDate.slice(0, 10)}</td>
                <td className="py-2">{c.newSalary}</td>
                <td className="py-2">{c.reason ?? ""}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    data-testid={`delete-salary-change-${c.id}`}
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

      <Modal open={open} onClose={close} title="Add salary change">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="block font-medium text-surface-700 mb-1">Effective date</span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              data-testid="salary-change-effective-date"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-surface-700 mb-1">New salary</span>
            <input
              type="number"
              value={newSalary}
              onChange={(e) => setNewSalary(e.target.value)}
              data-testid="salary-change-new-salary"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-surface-700 mb-1">Reason (optional)</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="salary-change-reason"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
            />
          </label>
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
              data-testid="submit-salary-change"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
