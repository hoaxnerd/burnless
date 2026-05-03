"use client";

/**
 * LocalDateRangePicker — fallback date range picker for the expenses form.
 *
 * Phase 1 §1.7. Two side-by-side native `<input type="date">` fields.
 * Will be migrated to the canonical `apps/web/src/components/forms/primitives/`
 * once that landing zone exists (Sub-project B). Until then this stays local
 * to the expenses route.
 *
 * Controlled-only.
 */

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (range: { startDate: Date | null; endDate: Date | null }) => void;
  startLabel?: string;
  endLabel?: string;
  required?: boolean;
  disabled?: boolean;
}

function toIsoDay(d: Date | null): string {
  if (!d) return "";
  // `<input type="date">` expects YYYY-MM-DD; use UTC components to avoid
  // timezone bleed when the Date was constructed from a YYYY-MM-DD string
  // (which Date interprets as UTC midnight).
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIsoDay(s: string): Date | null {
  if (!s) return null;
  // Treat as UTC midnight so round-trip is stable.
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function LocalDateRangePicker({
  startDate,
  endDate,
  onChange,
  startLabel = "Start date",
  endLabel = "End date",
  required = false,
  disabled = false,
}: DateRangePickerProps) {
  const startId = "lr-start-date";
  const endId = "lr-end-date";
  const inputClass =
    "w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-50 disabled:cursor-not-allowed";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label htmlFor={startId} className="block text-sm font-medium text-surface-700 mb-1">
          {startLabel}
          {required ? "" : " (optional)"}
        </label>
        <input
          id={startId}
          type="date"
          value={toIsoDay(startDate)}
          required={required}
          disabled={disabled}
          onChange={(e) => onChange({ startDate: fromIsoDay(e.target.value), endDate })}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={endId} className="block text-sm font-medium text-surface-700 mb-1">
          {endLabel} <span className="text-surface-400 font-normal">(optional)</span>
        </label>
        <input
          id={endId}
          type="date"
          value={toIsoDay(endDate)}
          disabled={disabled}
          onChange={(e) => onChange({ startDate, endDate: fromIsoDay(e.target.value) })}
          className={inputClass}
        />
      </div>
    </div>
  );
}
