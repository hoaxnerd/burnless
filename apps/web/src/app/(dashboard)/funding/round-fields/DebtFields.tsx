"use client";

import { NumberInput, PercentageInput, SingleDateInput } from "@/components/forms/primitives";
import { Select } from "@/components/ui";

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
      <Select
        label="Repayment Schedule"
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
        <option value="amortized">Amortized (equal P+I each month)</option>
      </Select>
      <SingleDateInput
        label="First Payment Date"
        value={params.firstPaymentDate ?? ""}
        onChange={(v) =>
          setParameters((p) => ({
            ...p,
            firstPaymentDate: v || undefined,
          }))
        }
      />
    </div>
  );
}
