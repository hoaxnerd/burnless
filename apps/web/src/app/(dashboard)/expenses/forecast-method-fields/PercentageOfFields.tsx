"use client";

/**
 * Sub-form for `percentage_of` forecast method.
 * Engine fields: { sourceLineId, percentage }. NOT `ofAccountId`.
 *
 * `percentage` is stored as a 0-1 fractional decimal in the engine.
 * PercentageInput handles the 0-1 ↔ 0-100 display conversion automatically.
 */

import { PercentageInput } from "@/components/forms/primitives";

interface PercentageOfParams {
  sourceLineId: string;
  percentage: number;
}

interface PercentageOfFieldsProps {
  params: PercentageOfParams;
  onChange: (next: PercentageOfParams) => void;
  lines: Array<{ id: string; name: string }>;
  disabled?: boolean;
}

const selectClass =
  "w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function PercentageOfFields({
  params,
  onChange,
  lines,
  disabled = false,
}: PercentageOfFieldsProps) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="po-source" className="block text-sm font-medium text-surface-700 mb-1">
          Source forecast line
        </label>
        <select
          id="po-source"
          value={params.sourceLineId}
          disabled={disabled}
          onChange={(e) => onChange({ ...params, sourceLineId: e.target.value })}
          className={selectClass}
        >
          <option value="">Select a forecast line…</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {lines.length === 0 && (
          <p className="mt-1 text-xs text-surface-500">
            No other forecast lines available to reference.
          </p>
        )}
      </div>
      <PercentageInput
        label="Percentage"
        value={params.percentage}
        onChange={(v) => onChange({ ...params, percentage: v })}
        required
        disabled={disabled}
        min={0}
        max={10}
        step={0.1}
      />
    </div>
  );
}
