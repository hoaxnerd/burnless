"use client";

import type { BenefitsBreakdown } from "@/lib/headcount-params";
import { PercentageInput } from "@/components/forms/primitives";

interface Props {
  value: BenefitsBreakdown;
  companyDefaults: BenefitsBreakdown;
  onChange: (next: BenefitsBreakdown) => void;
}

const SLOTS: Array<{ key: keyof BenefitsBreakdown; label: string }> = [
  { key: "statutoryEmployerContributionsCost", label: "Statutory employer contributions" },
  { key: "insuranceBenefitsCost", label: "Insurance benefits" },
  { key: "retirementContributionsCost", label: "Retirement contributions" },
  { key: "otherBenefitsCost", label: "Other benefits" },
];

/**
 * Editor for the per-employee benefits breakdown (4 slots, each a 0..1 decimal).
 * "Use company defaults" copies the company-level rates wholesale.
 * "Clear" removes all per-employee overrides (legacy benefitsRate is then used).
 */
export function BenefitsBreakdownEditor({ value, companyDefaults, onChange }: Props) {
  const total = SLOTS.reduce((s, { key }) => s + (value[key] ?? 0), 0);

  return (
    <div
      className="benefits-breakdown-editor space-y-3"
      data-testid="benefits-breakdown-editor"
    >
      <div className="grid grid-cols-2 gap-3">
        {SLOTS.map(({ key, label }) => (
          <PercentageInput
            key={key}
            label={label}
            value={value[key] ?? 0}
            onChange={(next) => {
              const updated: BenefitsBreakdown = { ...value };
              if (next === 0) delete updated[key];
              else (updated as Record<string, number>)[key] = next;
              onChange(updated);
            }}
            min={0}
            max={1}
            step={0.1}
            hint={`Default: ${((companyDefaults[key] ?? 0) * 100).toFixed(2)}%`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div data-testid="breakdown-total" className="text-xs text-surface-500">
          Total: {(total * 100).toFixed(2)}%
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...companyDefaults })}
            data-testid="use-company-defaults"
            className="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium text-surface-700 hover:bg-surface-50"
          >
            Use company defaults
          </button>
          <button
            type="button"
            onClick={() => onChange({})}
            data-testid="clear-breakdown"
            className="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium text-surface-700 hover:bg-surface-50"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
