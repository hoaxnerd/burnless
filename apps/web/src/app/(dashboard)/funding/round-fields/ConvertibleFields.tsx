"use client";

import { CurrencyInput, PercentageInput } from "@/components/forms/primitives";

interface ConvertibleFieldsProps {
  params: {
    valuationCap?: number;
    discountRate?: number;
    interestRate?: number;
    maturityDate?: string;
    conversionThreshold?: number;
  };
  setParameters: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

export function ConvertibleFields({ params, setParameters }: ConvertibleFieldsProps) {
  return (
    <div className="space-y-4">
      <CurrencyInput
        value={params.valuationCap ?? 0}
        onChange={(v) => setParameters((p) => ({ ...p, valuationCap: v || undefined }))}
        label="Valuation Cap"
      />
      <PercentageInput
        value={params.discountRate ?? 0}
        onChange={(v) => setParameters((p) => ({ ...p, discountRate: v || undefined }))}
        label="Discount Rate"
        max={0.5}
      />
      <PercentageInput
        value={params.interestRate ?? 0.08}
        onChange={(v) => setParameters((p) => ({ ...p, interestRate: v }))}
        label="Interest Rate (annualized)"
        max={0.5}
        hint="Accrues from issuance until conversion."
      />
      <div>
        <label className="text-sm font-medium">Maturity Date</label>
        <input
          type="date"
          className="input"
          value={params.maturityDate ?? ""}
          onChange={(e) =>
            setParameters((p) => ({ ...p, maturityDate: e.target.value || undefined }))
          }
        />
      </div>
      <CurrencyInput
        value={params.conversionThreshold ?? 0}
        onChange={(v) => setParameters((p) => ({ ...p, conversionThreshold: v || undefined }))}
        label="Conversion Threshold"
        hint="Minimum qualified-round size that triggers conversion."
      />
    </div>
  );
}
