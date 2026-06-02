"use client";

import { Check } from "lucide-react";

export type GenProgressStatus = "done" | "active" | "pending";

export interface GenProgressStep {
  label: string;
  status: GenProgressStatus;
}

export interface GenProgressStepsProps {
  steps: GenProgressStep[];
}

/**
 * Presentational vertical stepper. Every step is model-authored — this renderer
 * does no formatting and shows no financial data on its own. done=filled check,
 * active=ring, pending=muted dot.
 */
export function GenProgressSteps({ steps }: GenProgressStepsProps) {
  if (!steps || steps.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
        No progress steps.
      </div>
    );
  }

  return (
    <ol className="my-2 rounded-lg border border-surface-200 px-3 py-2">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const status: GenProgressStatus =
          step.status === "done" || step.status === "active" ? step.status : "pending";
        return (
          <li key={i} className="flex gap-3">
            {/* Marker column: node + connector line. */}
            <div className="flex flex-col items-center">
              {status === "done" ? (
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
                >
                  <Check className="h-3 w-3" />
                </span>
              ) : status === "active" ? (
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-brand-500 bg-white"
                >
                  <span className="h-2 w-2 rounded-full bg-brand-500" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-surface-300 bg-white"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-surface-300" />
                </span>
              )}
              {!isLast ? (
                <span
                  aria-hidden
                  className={`my-0.5 w-px grow ${
                    status === "done" ? "bg-green-300" : "bg-surface-200"
                  }`}
                />
              ) : null}
            </div>
            {/* Label column. */}
            <span
              className={`pb-3 text-sm ${
                status === "active"
                  ? "font-semibold text-surface-900"
                  : status === "done"
                    ? "text-surface-700"
                    : "text-surface-400"
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
