"use client";

import { CurrencyInput, NumberInput, PercentageInput } from "@/components/forms/primitives";

export interface FieldsProps {
  params: Record<string, unknown>;
  setParams: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

const get = <T,>(p: Record<string, unknown>, k: string, fb: T): T =>
  (p[k] as T) ?? fb;

export function OneTimeFields({ params, setParams }: FieldsProps) {
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <NumberInput
        label="Units per month"
        value={get(params, "unitsPerMonth", 0)}
        onChange={(n) => set("unitsPerMonth", n ?? 0)}
        required
        integerOnly
        min={0}
      />
      <CurrencyInput
        label="Price per unit"
        value={get(params, "pricePerUnit", 0)}
        onChange={(n) => set("pricePerUnit", n ?? 0)}
        required
        min={0}
      />
      <PercentageInput
        label="Unit growth rate"
        value={get(params, "unitGrowthRate", 0)}
        onChange={(n) => set("unitGrowthRate", n)}
        min={-1}
        max={1}
      />
    </div>
  );
}
