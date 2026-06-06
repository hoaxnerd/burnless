"use client";
import { useState } from "react";
import { ListChecks, X, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingPlan, PlanStepClient } from "../types";

export interface PlanPreviewCardProps {
  pending: PendingPlan;
  onSubmit: (plan: PendingPlan["spec"]) => void;
  disabled: boolean;
}

/**
 * Minimal plan-preview gate (worklog plan 1). Lists the proposed steps, lets the
 * user remove steps, and Proceed submits the (edited) plan. Rich editing + the
 * typed-node timeline land in Plan 4. Design-system primitives only.
 */
export function PlanPreviewCard({ pending, onSubmit, disabled }: PlanPreviewCardProps) {
  const [steps, setSteps] = useState<PlanStepClient[]>(pending.spec.steps);
  const resolved = pending.resolved;

  const remove = (id: string) => setSteps((s) => s.filter((step) => step.id !== id));

  return (
    <div className="my-2 rounded-2xl border border-accent-200 bg-accent-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-accent-500/10">
          <ListChecks className="h-3.5 w-3.5 text-accent-600" />
        </span>
        <p className="text-sm font-semibold text-surface-900">{pending.spec.title}</p>
      </div>
      {pending.spec.description ? (
        <p className="mb-2 text-xs text-surface-500">{pending.spec.description}</p>
      ) : null}
      <ol className="flex flex-col gap-1.5">
        {steps.map((step, i) => (
          <li key={step.id} className="flex items-start gap-2 rounded-xl border border-surface-200 bg-surface-0 px-3 py-2">
            <span className="mt-0.5 text-[11px] font-medium text-surface-400 tabular-nums">{i + 1}</span>
            {step.kind === "tool" ? <Wrench className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent-500" /> : null}
            <span className="min-w-0 flex-1 text-sm text-surface-700">{step.title}</span>
            {!resolved && !disabled ? (
              <button
                type="button"
                aria-label={`Remove step: ${step.title}`}
                onClick={() => remove(step.id)}
                className="text-surface-400 transition-colors hover:text-danger-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex justify-end">
        <Button onClick={() => onSubmit({ ...pending.spec, steps })} disabled={disabled || resolved}>
          {resolved ? "Started" : "Proceed"}
        </Button>
      </div>
    </div>
  );
}
