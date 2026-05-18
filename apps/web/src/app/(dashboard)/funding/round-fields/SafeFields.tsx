"use client";

import { CurrencyInput, PercentageInput } from "@/components/forms/primitives";

interface SafeFieldsProps {
  params: { valuationCap?: number; discountRate?: number; mfn?: boolean; proRata?: boolean };
  setParameters: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

export function SafeFields({ params, setParameters }: SafeFieldsProps) {
  return (
    <div className="space-y-4">
      <CurrencyInput
        value={params.valuationCap ?? 0}
        onChange={(v) => setParameters((p) => ({ ...p, valuationCap: v || undefined }))}
        label="Valuation Cap"
        hint="Optional. SAFE converts at the lower of cap-derived price or discount-derived price."
      />
      <PercentageInput
        value={params.discountRate ?? 0}
        onChange={(v) => setParameters((p) => ({ ...p, discountRate: v || undefined }))}
        label="Discount Rate"
        max={0.5}
        hint="Conversion discount vs qualified-round price."
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={params.mfn ?? false}
          onChange={(e) => setParameters((p) => ({ ...p, mfn: e.target.checked }))}
        />
        Most-Favored-Nation clause
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={params.proRata ?? false}
          onChange={(e) => setParameters((p) => ({ ...p, proRata: e.target.checked }))}
        />
        Pro-rata rights
      </label>
    </div>
  );
}
