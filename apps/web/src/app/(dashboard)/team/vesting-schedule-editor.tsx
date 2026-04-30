"use client";
import { useState } from "react";

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
  const [sharesVested, setSharesVested] = useState("");
  const total = value.reduce((s, v) => s + v.sharesVested, 0);
  const exceeds = totalShares !== undefined && total > totalShares;

  function addRow() {
    if (!date || !sharesVested) return;
    const next = [...value, { type, date, sharesVested: parseFloat(sharesVested) }];
    next.sort((a, b) => a.date.localeCompare(b.date));
    onChange(next);
    setDate("");
    setSharesVested("");
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
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  data-testid={`remove-vesting-${i}`}
                >
                  ×
                </button>
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
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid="vesting-date"
        />
        <input
          type="number"
          min={0}
          value={sharesVested}
          onChange={(e) => setSharesVested(e.target.value)}
          data-testid="vesting-shares"
          placeholder="shares"
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
