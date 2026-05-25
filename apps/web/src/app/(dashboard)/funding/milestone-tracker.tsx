"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useLocale } from "@/components/locale/locale-context";
import { SingleDateInput } from "@/components/forms/primitives";

interface Milestone {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  hitDate?: string;
  matchWarning?: { requiredAmount: number; actualAmount: number; asOf: string };
}

export function MilestoneTracker({
  roundId, milestones, onUpdate,
}: {
  roundId: string;
  milestones: Milestone[];
  onUpdate: () => void;
}) {
  const { fmtCurrency } = useLocale();

  const markHit = async (id: string, date: string) => {
    const res = await apiFetch(`/api/funding-rounds/${roundId}/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hitDate: date }),
    });
    if (res.ok) onUpdate();
  };

  return (
    <ul className="space-y-1">
      {milestones.map((m) => (
        <li key={m.id} className="flex items-center justify-between p-2 border rounded">
          <div>
            <div className="text-sm font-medium">{m.label}</div>
            <div className="text-xs text-muted">Due {m.dueDate} · {fmtCurrency(m.amount)}</div>
            {m.matchWarning && (
              <div className="text-xs text-amber-600 mt-1">
                ⚠️ Match shortfall: {fmtCurrency(m.matchWarning.actualAmount)} of{" "}
                {fmtCurrency(m.matchWarning.requiredAmount)} required by {m.matchWarning.asOf}
              </div>
            )}
          </div>
          {m.hitDate ? (
            <span className="badge-success">Hit {m.hitDate}</span>
          ) : (
            // value="" is intentional: after onChange fires markHit the parent
            // re-renders with hitDate set, replacing this field with a badge.
            <SingleDateInput
              label={`Mark ${m.label} hit on date`}
              value=""
              onChange={(v) => { if (v) markHit(m.id, v); }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
