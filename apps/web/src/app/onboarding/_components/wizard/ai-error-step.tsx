"use client";

import { RotateCcw, AlertCircle } from "lucide-react";

/**
 * AiErrorStep — explicit AI-research-failure screen (replaces the old silent
 * 2.5s auto-fallback). Offers three escapes: retry the research, drop into the
 * wizard and enter details manually, or defer entirely ("I'll do this later").
 *
 * Pixel contract: the AI-error card in mockup 02
 * (docs/superpowers/specs/assets/2026-06-12-s4b-onboarding-wizard/02-ai-flow-and-states.html)
 * — danger icon, "We couldn't research your company" copy, primary "↻ Try again",
 * ghost "Enter details manually", quieter "I'll do this later" link.
 * Pure presentation — no data fetching.
 */
export function AiErrorStep({
  onRetry,
  onManual,
  onLater,
}: {
  onRetry: () => void;
  onManual: () => void;
  onLater: () => void;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-0 p-6 text-center dark:border-surface-700 dark:bg-surface-900">
      <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-950">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="mb-1.5 text-base font-bold text-surface-900 dark:text-surface-100">
        We couldn&apos;t research your company
      </h3>
      <p className="mx-auto mb-[18px] max-w-[340px] text-[12.5px] text-surface-500">
        The AI assistant hit an error while analysing your website. You can try again, or just enter
        your details yourself.
      </p>
      <div className="flex justify-center gap-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
        <button
          type="button"
          onClick={onManual}
          className="rounded-xl border border-surface-300 bg-transparent px-5 py-2.5 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-100 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
        >
          Enter details manually
        </button>
      </div>
      <button
        type="button"
        onClick={onLater}
        className="mt-3.5 block w-full border-none bg-transparent text-[11.5px] font-medium text-surface-400 transition-colors hover:text-surface-500"
      >
        or — I&apos;ll do this later
      </button>
    </div>
  );
}
