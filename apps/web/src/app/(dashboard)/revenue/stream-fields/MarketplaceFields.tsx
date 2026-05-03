"use client";

import { CurrencyInput, PercentageInput } from "@/components/forms/primitives";

export interface FieldsProps {
  params: Record<string, unknown>;
  setParams: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

const get = <T,>(p: Record<string, unknown>, k: string, fb: T): T =>
  (p[k] as T) ?? fb;

export function MarketplaceFields({ params, setParams }: FieldsProps) {
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <CurrencyInput
        label="Starting GMV"
        value={get(params, "startingGmv", 0)}
        onChange={(n) => set("startingGmv", n ?? 0)}
        required
        min={0}
      />
      <PercentageInput
        label="Take rate"
        value={get(params, "takeRate", 0)}
        onChange={(n) => set("takeRate", n)}
        required
        max={1}
      />
      <PercentageInput
        label="GMV growth rate"
        value={get(params, "gmvGrowthRate", 0)}
        onChange={(n) => set("gmvGrowthRate", n)}
        min={-1}
        max={1}
      />
    </div>
  );
}
