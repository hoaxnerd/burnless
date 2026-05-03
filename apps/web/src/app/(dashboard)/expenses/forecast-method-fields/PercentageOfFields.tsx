"use client";

/**
 * Sub-form for `percentage_of` forecast method.
 * Engine fields: { sourceLineId, percentage }. NOT `ofAccountId`.
 */

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

const inputClass =
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
          className={inputClass}
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
      <div>
        <label htmlFor="po-pct" className="block text-sm font-medium text-surface-700 mb-1">
          Percentage
        </label>
        <input
          id="po-pct"
          type="number"
          step="0.001"
          value={Number.isFinite(params.percentage) ? params.percentage : 0}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...params,
              percentage: e.target.value === "" ? 0 : Number(e.target.value),
            })
          }
          className={inputClass}
          placeholder="0.15"
        />
        <p className="mt-1 text-xs text-surface-500">Decimal, e.g. 0.15 = 15%.</p>
      </div>
    </div>
  );
}
