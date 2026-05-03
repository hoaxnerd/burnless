"use client";

import { CurrencyInput, NumberInput, PercentageInput } from "@/components/forms/primitives";

export interface FieldsProps {
  params: Record<string, unknown>;
  setParams: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

const get = <T,>(p: Record<string, unknown>, k: string, fb: T): T =>
  (p[k] as T) ?? fb;

export function EcommerceFields({ params, setParams }: FieldsProps) {
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <NumberInput
        label="Orders per month"
        value={get(params, "ordersPerMonth", 0)}
        onChange={(n) => set("ordersPerMonth", n ?? 0)}
        required
        min={0}
      />
      <CurrencyInput
        label="Average order value"
        value={get(params, "averageOrderValue", 0)}
        onChange={(n) => set("averageOrderValue", n ?? 0)}
        required
        min={0}
      />
      <PercentageInput
        label="Order growth rate"
        value={get(params, "orderGrowthRate", 0)}
        onChange={(n) => set("orderGrowthRate", n)}
        min={-1}
        max={1}
      />
      <PercentageInput
        label="AOV growth rate"
        value={get(params, "aovGrowthRate", 0)}
        onChange={(n) => set("aovGrowthRate", n)}
        min={-1}
        max={1}
      />
    </div>
  );
}
