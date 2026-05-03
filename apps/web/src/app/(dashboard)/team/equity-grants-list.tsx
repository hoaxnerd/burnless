"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { Modal } from "@/components/ui";
import {
  VestingScheduleEditor,
  type VestingMilestone,
} from "./vesting-schedule-editor";

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
  scenarioId: string;
  grants: EquityGrant[];
}

export function EquityGrantsList({ headcountId, scenarioId, grants }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [grantDate, setGrantDate] = useState("");
  const [shares, setShares] = useState("");
  const [strikePrice, setStrikePrice] = useState("");
  const [grantType, setGrantType] = useState<GrantType>("iso");
  const [vesting, setVesting] = useState<VestingMilestone[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...grants].sort((a, b) => a.grantDate.localeCompare(b.grantDate));

  function reset() {
    setGrantDate("");
    setShares("");
    setStrikePrice("");
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
          "X-Scenario-Id": scenarioId,
        },
        body: JSON.stringify({
          grantDate,
          shares: parseFloat(shares),
          strikePrice: strikePrice === "" ? null : parseFloat(strikePrice),
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

  const totalSharesNum = shares === "" ? undefined : parseFloat(shares);

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
          <label className="block text-sm">
            <span className="block font-medium text-surface-700 mb-1">Grant date</span>
            <input
              type="date"
              value={grantDate}
              onChange={(e) => setGrantDate(e.target.value)}
              data-testid="equity-grant-date"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-surface-700 mb-1">Shares</span>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              data-testid="equity-grant-shares"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-surface-700 mb-1">Strike price (optional)</span>
            <input
              type="number"
              value={strikePrice}
              onChange={(e) => setStrikePrice(e.target.value)}
              data-testid="equity-grant-strike-price"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
            />
          </label>
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
