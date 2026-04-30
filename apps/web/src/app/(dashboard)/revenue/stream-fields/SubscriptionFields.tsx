"use client";

import { CurrencyInput, NumberInput, PercentageInput } from "@/components/forms/primitives";

export interface FieldsProps {
  params: Record<string, unknown>;
  setParams: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

const get = <T,>(p: Record<string, unknown>, k: string, fb: T): T =>
  (p[k] as T) ?? fb;

export function SubscriptionFields({ params, setParams }: FieldsProps) {
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <NumberInput
        label="Starting customers"
        value={get(params, "startingCustomers", 0)}
        onChange={(n) => set("startingCustomers", n ?? 0)}
        required
        integerOnly
        min={0}
      />
      <CurrencyInput
        label="Monthly price"
        value={get(params, "monthlyPrice", 0)}
        onChange={(n) => set("monthlyPrice", n ?? 0)}
        required
        min={0}
      />
      <NumberInput
        label="New customers per month"
        value={get(params, "newCustomersPerMonth", 0)}
        onChange={(n) => set("newCustomersPerMonth", n ?? 0)}
        integerOnly
        min={0}
      />
      <PercentageInput
        label="Monthly churn rate"
        value={get(params, "monthlyChurnRate", 0)}
        onChange={(n) => set("monthlyChurnRate", n)}
        max={1}
      />
      <PercentageInput
        label="Expansion rate"
        value={get(params, "expansionRate", 0)}
        onChange={(n) => set("expansionRate", n)}
        max={1}
        hint="Existing-MRR uplift each month"
      />
      <PercentageInput
        label="Price growth rate"
        value={get(params, "priceGrowthRate", 0)}
        onChange={(n) => set("priceGrowthRate", n)}
        min={-1}
        max={1}
      />
      <p className="col-span-full text-xs text-surface-500">
        Tiered / per-seat pricing editor lands in Task 15.
      </p>
    </div>
  );
}
