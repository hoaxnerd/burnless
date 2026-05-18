"use client";

import { CurrencyInput } from "@/components/forms/primitives";

interface Milestone {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  hitDate?: string;
}

interface MilestoneEditorProps {
  milestones: Milestone[];
  onChange: (next: Milestone[]) => void;
}

export function MilestoneEditor({ milestones, onChange }: MilestoneEditorProps) {
  const updateAt = (i: number, patch: Partial<Milestone>) =>
    onChange(milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => onChange(milestones.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...milestones,
      { id: crypto.randomUUID(), label: "", amount: 0, dueDate: new Date().toISOString().slice(0, 10) },
    ]);

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Milestones</div>
      {milestones.map((m, i) => (
        <div key={m.id} className="grid grid-cols-12 gap-2 items-end p-2 border rounded">
          <input
            className="col-span-4 input-sm"
            placeholder="Milestone label"
            value={m.label}
            onChange={(e) => updateAt(i, { label: e.target.value })}
          />
          <div className="col-span-3">
            <CurrencyInput
              value={m.amount}
              onChange={(v) => updateAt(i, { amount: v })}
              label=""
            />
          </div>
          <input
            type="date"
            className="col-span-3 input-sm"
            value={m.dueDate}
            onChange={(e) => updateAt(i, { dueDate: e.target.value })}
          />
          <button
            type="button"
            className="col-span-2 btn-ghost-sm text-danger"
            onClick={() => remove(i)}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn-outline-sm" onClick={add}>
        + Add milestone
      </button>
    </div>
  );
}
