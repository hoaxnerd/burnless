"use client";

import { useEffect } from "react";
import { CurrencyInput, NumberInput, PercentageInput } from "@/components/forms/primitives";
import { Select } from "@/components/ui";
import { TieredPricingEditor } from "./TieredPricingEditor";
import type { PricingTier } from "@burnless/engine";

export interface FieldsProps {
  params: Record<string, unknown>;
  setParams: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

const get = <T,>(p: Record<string, unknown>, k: string, fb: T): T =>
  (p[k] as T) ?? fb;

const PER_SEAT_DEFAULT_SEATS = 25;

export function SubscriptionFields({ params, setParams }: FieldsProps) {
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  const pricingModel = (params.pricingModel as "flat" | "per_seat" | "tiered" | undefined) ?? "flat";

  // Engine requires seatsPerCustomer != null to enter the per-seat branch.
  // Seed the visible default into params so save round-trips it without
  // requiring the user to re-type the prefilled value.
  useEffect(() => {
    if (pricingModel === "per_seat" && params.seatsPerCustomer == null) {
      set("seatsPerCustomer", PER_SEAT_DEFAULT_SEATS);
    }
  }, [pricingModel, params.seatsPerCustomer]);

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
      <label className="col-span-full block text-sm">
        <span className="text-surface-700 dark:text-surface-300">Pricing model</span>
        <Select
          className="mt-1"
          value={pricingModel}
          onChange={(e) => set("pricingModel", e.target.value)}
          aria-label="Subscription pricing model"
        >
          <option value="flat">Flat (monthlyPrice per customer)</option>
          <option value="per_seat">Per seat (seats &times; tier price)</option>
          <option value="tiered">Tiered (reserved)</option>
        </Select>
      </label>
      {pricingModel === "per_seat" && (
        <NumberInput
          label="Seats per customer"
          integerOnly
          min={1}
          value={get<number>(params, "seatsPerCustomer", 25)}
          onChange={(n) => set("seatsPerCustomer", n ?? 1)}
        />
      )}
      {pricingModel !== "flat" && (
        <TieredPricingEditor
          tiers={(params.tiers as PricingTier[] | undefined) ?? []}
          onChange={(next) => set("tiers", next)}
        />
      )}
    </div>
  );
}
