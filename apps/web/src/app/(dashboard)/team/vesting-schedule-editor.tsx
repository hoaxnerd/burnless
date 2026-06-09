"use client";
import { useState } from "react";
import { NumberInput, SingleDateInput } from "@/components/forms/primitives";
import { IconButton } from "@/components/ui";

export type VestingMilestoneType = "cliff" | "monthly" | "quarterly" | "annual" | "milestone";
export interface VestingMilestone {
  type: VestingMilestoneType;
  date: string;
  sharesVested: number;
}

interface Props {
  value: VestingMilestone[];
  onChange: (next: VestingMilestone[]) => void;
  totalShares?: number;
}

export function VestingScheduleEditor({ value, onChange, totalShares }: Props) {
  const [type, setType] = useState<VestingMilestoneType>("cliff");
  const [date, setDate] = useState("");
  const [sharesVested, setSharesVested] = useState<number | null>(null);
  const total = value.reduce((s, v) => s + v.sharesVested, 0);
  const exceeds = totalShares !== undefined && total > totalShares;

  function addRow() {
    if (!date || sharesVested === null) return;
    const next = [...value, { type, date, sharesVested }];
    next.sort((a, b) => a.date.localeCompare(b.date));
    onChange(next);
    setDate("");
    setSharesVested(null);
  }

  function removeRow(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div data-testid="vesting-schedule-editor">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Date</th>
            <th>Shares</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {value.map((m, i) => (
            <tr key={i} data-testid={`vesting-row-${i}`}>
              <td>{m.type}</td>
              <td>{m.date}</td>
              <td>{m.sharesVested}</td>
              <td>
                <IconButton
                  type="button"
                  onClick={() => removeRow(i)}
                  data-testid={`remove-vesting-${i}`}
                  aria-label={`Remove vesting milestone ${i + 1}`}
                  size="sm"
                  icon={<span aria-hidden="true">×</span>}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as VestingMilestoneType)}
          data-testid="vesting-type-select"
        >
          <option value="cliff">Cliff</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
          <option value="milestone">Milestone</option>
        </select>
        <SingleDateInput
          label="Vesting date"
          value={date}
          onChange={setDate}
        />
        <NumberInput
          label="Shares vested"
          value={sharesVested}
          onChange={(next) => setSharesVested(next)}
          min={0}
        />
        <button type="button" onClick={addRow} data-testid="add-vesting">
          Add
        </button>
      </div>
      {totalShares !== undefined && (
        <div data-testid="vesting-total">
          Total: {total} / {totalShares}
          {exceeds && <span> (exceeds)</span>}
        </div>
      )}
    </div>
  );
}
