"use client";

import { NumberInput, PercentageInput } from "@/components/forms/primitives";

interface DebtFieldsProps {
  params: {
    interestRate?: number;
    termMonths?: number;
    repaymentSchedule?: "straight_line" | "amortized" | "interest_only";
    firstPaymentDate?: string;
  };
  setParameters: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

export function DebtFields({ params, setParameters }: DebtFieldsProps) {
  return (
    <div className="space-y-4">
      <PercentageInput
        value={params.interestRate ?? 0.08}
        onChange={(v) => setParameters((p) => ({ ...p, interestRate: v }))}
        label="Interest Rate (annualized)"
        max={1.0}
        required
      />
      <NumberInput
        value={params.termMonths ?? 36}
        onChange={(v) => setParameters((p) => ({ ...p, termMonths: v ?? 36 }))}
        label="Term (months)"
        required
      />
      <div>
        <label className="text-sm font-medium">Repayment Schedule</label>
        <select
          className="input"
          value={params.repaymentSchedule ?? "straight_line"}
          onChange={(e) =>
            setParameters((p) => ({
              ...p,
              repaymentSchedule: e.target.value as DebtFieldsProps["params"]["repaymentSchedule"],
            }))
          }
        >
          <option value="straight_line">Straight-line (equal principal each month)</option>
          <option value="interest_only">Interest-only with balloon</option>
          <option value="amortized">Amortized (equal P+I each month) — coming soon</option>
        </select>
      </div>
      <div>
        <label className="text-sm font-medium">First Payment Date</label>
        <input
          type="date"
          className="input"
          value={params.firstPaymentDate ?? ""}
          onChange={(e) =>
            setParameters((p) => ({
              ...p,
              firstPaymentDate: e.target.value || undefined,
            }))
          }
        />
      </div>
    </div>
  );
}
