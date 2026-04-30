"use client";

import { CurrencyInput, NumberInput, PercentageInput } from "@/components/forms/primitives";

export interface FieldsProps {
  params: Record<string, unknown>;
  setParams: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

const get = <T,>(p: Record<string, unknown>, k: string, fb: T): T =>
  (p[k] as T) ?? fb;

export function ServicesFields({ params, setParams }: FieldsProps) {
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <NumberInput
        label="Hours per month"
        value={get(params, "hoursPerMonth", 0)}
        onChange={(n) => set("hoursPerMonth", n ?? 0)}
        required
        min={0}
      />
      <CurrencyInput
        label="Hourly rate"
        value={get(params, "hourlyRate", 0)}
        onChange={(n) => set("hourlyRate", n ?? 0)}
        required
        min={0}
      />
      <PercentageInput
        label="Hours growth rate"
        value={get(params, "hoursGrowthRate", 0)}
        onChange={(n) => set("hoursGrowthRate", n)}
        min={-1}
        max={1}
      />
      <PercentageInput
        label="Rate increase rate"
        value={get(params, "rateIncreaseRate", 0)}
        onChange={(n) => set("rateIncreaseRate", n)}
        min={-1}
        max={1}
      />
    </div>
  );
}
