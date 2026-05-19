"use client";

import { useState } from "react";

export interface DateRangePickerProps {
  startDate: string; // ISO YYYY-MM-DD
  endDate: string | null; // null = open-ended
  onChange: (next: { startDate: string; endDate: string | null }) => void;
  startLabel?: string;
  endLabel?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  startLabel = "Start date",
  endLabel = "End date",
  required = false,
  disabled = false,
  hint,
}: DateRangePickerProps) {
  const [hasEnd, setHasEnd] = useState(endDate !== null);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Start date */}
        <div className="block text-sm">
          <label
            htmlFor="drp-start"
            className="block text-surface-700 dark:text-surface-300"
          >
            {startLabel}
            {required && <span className="text-danger-500"> *</span>}
          </label>
          <input
            id="drp-start"
            type="date"
            value={startDate}
            required={required}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                startDate: e.target.value,
                endDate: hasEnd ? endDate : null,
              })
            }
            className="mt-1 block w-full rounded-md border border-surface-300 dark:bg-surface-800 px-2 py-1"
            aria-label={startLabel}
          />
        </div>

        {/* End date */}
        <div className="block text-sm">
          <label
            htmlFor="drp-end"
            className="block text-surface-700 dark:text-surface-300"
          >
            {endLabel}
          </label>
          <input
            id="drp-end"
            type="date"
            value={endDate ?? ""}
            disabled={disabled || !hasEnd}
            onChange={(e) =>
              onChange({ startDate, endDate: e.target.value || null })
            }
            className="mt-1 block w-full rounded-md border border-surface-300 dark:bg-surface-800 px-2 py-1"
            aria-label={endLabel}
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={!hasEnd}
              disabled={disabled}
              title="No end date"
              onChange={(e) => {
                const next = !e.target.checked;
                setHasEnd(next);
                onChange({ startDate, endDate: next ? endDate : null });
              }}
            />
            <span
              aria-hidden="true"
              className="text-xs text-surface-500 select-none"
            >
              No end date
            </span>
          </div>
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-surface-500">{hint}</p>}
    </div>
  );
}
