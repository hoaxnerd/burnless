"use client";

/**
 * DraftCard — presentation of an onboarding suggestion (AI-detected or user-added).
 *
 * Pixel contract: the review-section card in mockups 01/03
 * (docs/superpowers/specs/assets/2026-06-12-s4b-onboarding-wizard/).
 * AI-detected suggestions get a purple left accent border; the body shows
 * title / meta / amount, an Edit action, and an optional remove control.
 * Pure presentation — no data fetching, no state.
 */
export function DraftCard({
  title,
  meta,
  amount,
  ai = false,
  onEdit,
  onRemove,
}: {
  title: string;
  meta?: string;
  amount?: string;
  ai?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`relative mb-2.5 flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-0 px-3.5 py-3${
        ai ? " border-l-[3px] border-l-accent-500" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-surface-900">{title}</div>
        {meta ? <div className="mt-0.5 text-xs text-surface-500">{meta}</div> : null}
      </div>
      {amount ? (
        <span className="text-sm font-bold tabular-nums text-surface-900">{amount}</span>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
      >
        Edit
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="text-surface-400 hover:text-surface-700"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}
