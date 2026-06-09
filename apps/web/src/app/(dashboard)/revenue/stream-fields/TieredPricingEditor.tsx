"use client";

import { useEffect, useMemo } from "react";
import { NumberInput } from "@/components/forms/primitives";
import { Input } from "@/components/ui";
import { validateTiers } from "@/lib/revenue-params";
import type { PricingTier } from "@burnless/engine";

export interface TieredPricingEditorProps {
  tiers: PricingTier[];
  onChange: (next: PricingTier[]) => void;
  /** Called whenever tier validity changes; parent disables submit when invalid. */
  onValidityChange?: (valid: boolean) => void;
}

const NEW_TIER: PricingTier = { name: "New tier", minUnits: 0, maxUnits: 10, pricePerUnit: 0 };

export function TieredPricingEditor({ tiers, onChange, onValidityChange }: TieredPricingEditorProps) {
  const error = useMemo(() => {
    try {
      validateTiers(tiers);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [tiers]);

  // Notify parent of validity transitions
  useEffect(() => {
    onValidityChange?.(error === null);
  }, [error, onValidityChange]);

  const updateTier = (i: number, patch: Partial<PricingTier>) => {
    const next = tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    onChange(next);
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const newMin = last ? (last.maxUnits ?? last.minUnits) + 1 : 0;
    onChange([...tiers, { ...NEW_TIER, minUnits: newMin, maxUnits: newMin + 9 }]);
  };

  const removeTier = (i: number) => onChange(tiers.filter((_, idx) => idx !== i));

  return (
    <div className="col-span-full space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-surface-700 dark:text-surface-300">Pricing tiers</h4>
        <button
          type="button"
          onClick={addTier}
          className="rounded-md px-2 py-1 text-xs border border-surface-300"
        >
          + Add tier
        </button>
      </div>
      {tiers.length === 0 && (
        <p className="text-xs text-surface-500">No tiers yet. Click &ldquo;Add tier&rdquo; to start.</p>
      )}
      {tiers.map((t, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-end">
          <label className="col-span-4 text-xs">
            <span className="text-surface-700 dark:text-surface-300">Name</span>
            <Input
              type="text"
              value={t.name}
              onChange={(e) => updateTier(i, { name: e.target.value })}
              className="mt-1 text-sm"
              aria-label={`Tier ${i + 1} name`}
            />
          </label>
          <div className="col-span-2">
            <NumberInput
              label="Min"
              integerOnly
              min={0}
              value={t.minUnits}
              onChange={(n) => updateTier(i, { minUnits: n ?? 0 })}
            />
          </div>
          <div className="col-span-2">
            <NumberInput
              label="Max"
              integerOnly
              min={0}
              value={t.maxUnits}
              onChange={(n) => updateTier(i, { maxUnits: n })}
              hint={t.maxUnits === null ? "open" : undefined}
            />
          </div>
          <div className="col-span-3">
            <NumberInput
              label="Price/unit"
              min={0}
              value={t.pricePerUnit}
              onChange={(n) => updateTier(i, { pricePerUnit: n ?? 0 })}
            />
          </div>
          <button
            type="button"
            onClick={() => removeTier(i)}
            className="col-span-1 rounded-md px-2 py-1 text-xs border border-danger-300 text-danger-600"
            aria-label={`Remove tier ${i + 1}`}
          >
            &times;
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-danger-600">{error}</p>
      )}
    </div>
  );
}
