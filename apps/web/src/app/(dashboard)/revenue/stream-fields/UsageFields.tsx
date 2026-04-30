"use client";

import { CurrencyInput, NumberInput, PercentageInput } from "@/components/forms/primitives";

export interface FieldsProps {
  params: Record<string, unknown>;
  setParams: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

const get = <T,>(p: Record<string, unknown>, k: string, fb: T): T =>
  (p[k] as T) ?? fb;

export function UsageFields({ params, setParams }: FieldsProps) {
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <NumberInput
        label="Active users"
        value={get(params, "activeUsers", 0)}
        onChange={(n) => set("activeUsers", n ?? 0)}
        required
        integerOnly
        min={0}
      />
      <NumberInput
        label="Avg usage per user"
        value={get(params, "avgUsagePerUser", 0)}
        onChange={(n) => set("avgUsagePerUser", n ?? 0)}
        required
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
        label="User growth rate"
        value={get(params, "userGrowthRate", 0)}
        onChange={(n) => set("userGrowthRate", n)}
        min={-1}
        max={1}
      />
      <PercentageInput
        label="Usage growth rate"
        value={get(params, "usageGrowthRate", 0)}
        onChange={(n) => set("usageGrowthRate", n)}
        min={-1}
        max={1}
      />
      <p className="col-span-full text-xs text-surface-500">
        Tiered / per-seat pricing editor lands in Task 15.
      </p>
    </div>
  );
}
