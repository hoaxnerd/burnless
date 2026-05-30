"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal } from "@/components/ui";
import {
  VestingScheduleEditor,
  type VestingMilestone,
} from "./vesting-schedule-editor";
import { CurrencyInput, NumberInput, SingleDateInput } from "@/components/forms/primitives";

export type GrantType = "iso" | "nso" | "rsu";

export interface EquityGrant {
  id: string;
  grantDate: string;
  shares: number;
  strikePrice?: number | null;
  grantType: GrantType;
  parameters?: { vestingSchedule?: VestingMilestone[] } | null;
}

interface Props {
  headcountId: string;
  grants: EquityGrant[];
}

export function EquityGrantsList({ headcountId, grants }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [grantDate, setGrantDate] = useState("");
  const [shares, setShares] = useState<number | null>(null);
  const [strikePrice, setStrikePrice] = useState<number | null>(null);
  const [grantType, setGrantType] = useState<GrantType>("iso");
  const [vesting, setVesting] = useState<VestingMilestone[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...grants].sort((a, b) => a.grantDate.localeCompare(b.grantDate));

  function reset() {
    setGrantDate("");
    setShares(null);
    setStrikePrice(null);
    setGrantType("iso");
    setVesting([]);
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
      const res = await apiFetch(`/api/headcount/${headcountId}/equity-grants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grantDate,
          shares: shares ?? 0,
          strikePrice: strikePrice,
          grantType,
          parameters: { vestingSchedule: vesting },
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
    if (!window.confirm("Delete this equity grant?")) return;
    const res = await apiFetch(
      `/api/headcount/${headcountId}/equity-grants/${id}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to delete");
      return;
    }
    router.refresh();
  }

  const totalSharesNum = shares === null ? undefined : shares;

  return (
    <div data-testid="equity-grants-list">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">Equity grants</h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="open-add-equity-grant"
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Add
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-surface-500">No equity grants recorded.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-600">
              <th className="py-2">Grant date</th>
              <th className="py-2">Shares</th>
              <th className="py-2">Strike price</th>
              <th className="py-2">Type</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <tr key={g.id} data-testid={`equity-grant-${g.id}`} className="border-t border-surface-200">
                <td className="py-2">{g.grantDate.slice(0, 10)}</td>
                <td className="py-2">{g.shares}</td>
                <td className="py-2">{g.strikePrice ?? ""}</td>
                <td className="py-2">{g.grantType}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id)}
                    data-testid={`delete-equity-grant-${g.id}`}
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

      <Modal open={open} onClose={close} title="Add equity grant">
        <div className="space-y-3">
          <SingleDateInput
            label="Grant date"
            value={grantDate}
            onChange={setGrantDate}
          />
          <NumberInput
            label="Shares"
            value={shares}
            onChange={(next) => setShares(next)}
            min={0}
          />
          <CurrencyInput
            label="Strike price (optional)"
            value={strikePrice ?? 0}
            onChange={(next) => setStrikePrice(next === 0 ? null : next)}
            min={0}
            step={0.01}
          />
          <label className="block text-sm">
            <span className="block font-medium text-surface-700 mb-1">Type</span>
            <select
              value={grantType}
              onChange={(e) => setGrantType(e.target.value as GrantType)}
              data-testid="equity-grant-type"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
            >
              <option value="iso">ISO</option>
              <option value="nso">NSO</option>
              <option value="rsu">RSU</option>
            </select>
          </label>
          <fieldset className="rounded-lg border border-surface-200 p-3">
            <legend className="px-1 text-xs font-medium text-surface-700">Vesting schedule</legend>
            <VestingScheduleEditor
              value={vesting}
              onChange={setVesting}
              totalShares={totalSharesNum}
            />
          </fieldset>
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
              data-testid="submit-equity-grant"
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
