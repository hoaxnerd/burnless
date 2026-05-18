"use client";

import { CurrencyInput, NumberInput } from "@/components/forms/primitives";

interface EquityFieldsProps {
  params: {
    shareClassId?: string;
    sharesIssued?: number;
    pricePerShare?: number;
    liquidationPreference?: number;
  };
  setParameters: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

export function EquityFields({ params, setParameters }: EquityFieldsProps) {
  return (
    <div className="space-y-4">
      <NumberInput
        value={params.sharesIssued ?? null}
        onChange={(v) => setParameters((p) => ({ ...p, sharesIssued: v ?? undefined }))}
        label="Shares Issued"
        hint="Optional. New preferred shares created by this round."
      />
      <CurrencyInput
        value={params.pricePerShare ?? 0}
        onChange={(v) => setParameters((p) => ({ ...p, pricePerShare: v || undefined }))}
        label="Price Per Share"
        step={0.0001}
        hint="Optional. Derived from amount/shares if both provided."
      />
      <NumberInput
        value={params.liquidationPreference ?? 1}
        onChange={(v) => setParameters((p) => ({ ...p, liquidationPreference: v ?? 1 }))}
        label="Liquidation Preference"
        hint="Multiple (e.g., 1× for 1x non-participating)."
      />
    </div>
  );
}
