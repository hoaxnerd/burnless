"use client";

/**
 * Sub-form for `fixed` forecast method.
 * Engine field: { amount }.
 */

import { CurrencyInput } from "@/components/forms/primitives";

interface FixedParams {
  amount: number;
}

interface FixedFieldsProps {
  params: FixedParams;
  onChange: (next: FixedParams) => void;
  disabled?: boolean;
}

export function FixedFields({ params, onChange, disabled = false }: FixedFieldsProps) {
  return (
    <div>
      <CurrencyInput
        label="Amount"
        value={params.amount}
        onChange={(v) => onChange({ amount: v })}
        required
        disabled={disabled}
        hint="Per-period amount in your selected frequency."
      />
    </div>
  );
}
