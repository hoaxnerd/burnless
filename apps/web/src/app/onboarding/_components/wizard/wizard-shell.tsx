"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

interface WizardShellProps {
  steps: { id: string; label: string }[];
  activeId: string;
  canContinue: boolean;
  isLast: boolean;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  hideBack?: boolean;
  children: ReactNode; // the active step panel
}

/**
 * Direction A onboarding wizard shell: a top horizontal stepper, centered
 * single-column content, and a bottom nav bar (Back / Skip / primary Continue).
 * Pure presentation — no data fetching. Pixel contract:
 * docs/superpowers/specs/assets/2026-06-12-s4b-onboarding-wizard/01-wizard-shell-directionA.html
 */
export function WizardShell({
  steps,
  activeId,
  canContinue,
  isLast,
  onBack,
  onSkip,
  onContinue,
  hideBack,
  children,
}: WizardShellProps) {
  const activeIndex = steps.findIndex((s) => s.id === activeId);

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900">
          {/* Top stepper */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-surface-200 px-4 py-3.5 dark:border-surface-700">
            {steps.map((step, i) => {
              const isDone = activeIndex >= 0 && i < activeIndex;
              const isActive = i === activeIndex;
              return (
                <div key={step.id} className="flex items-center gap-1.5">
                  <span
                    className={[
                      "flex items-center gap-1.5 text-[11px] font-semibold",
                      isActive
                        ? "text-brand-700 dark:text-brand-400"
                        : isDone
                          ? "text-surface-700 dark:text-surface-300"
                          : "text-surface-400",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] text-[10px]",
                        isDone
                          ? "border-brand-600 bg-brand-600 text-white"
                          : isActive
                            ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400"
                            : "border-surface-300 text-surface-400",
                      ].join(" ")}
                    >
                      {isDone ? "✓" : i + 1}
                    </span>
                    {step.label}
                  </span>
                  {i < steps.length - 1 && (
                    <span
                      className={[
                        "h-0.5 min-w-2 flex-1",
                        isDone ? "bg-brand-600" : "bg-surface-200 dark:bg-surface-700",
                      ].join(" ")}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Centered step panel */}
          <div className="p-5">{children}</div>

          {/* Nav bar */}
          <div className="flex items-center gap-2.5 border-t border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-900">
            {!hideBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-surface-200 bg-transparent px-4 py-2.5 text-sm font-semibold text-surface-500 transition-colors hover:bg-surface-100 dark:border-surface-700 dark:hover:bg-surface-800"
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={onSkip}
              className="rounded-xl border-none bg-transparent px-2 py-2.5 text-xs font-medium text-surface-500 transition-colors hover:text-surface-700 dark:hover:text-surface-300"
            >
              Skip this step
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinue}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLast ? (
                "Go to dashboard"
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
