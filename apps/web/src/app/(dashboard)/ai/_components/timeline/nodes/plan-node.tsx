// apps/web/src/app/(dashboard)/ai/_components/timeline/nodes/plan-node.tsx
"use client";
import { useState } from "react";
import { ListChecks, X, ArrowDown, ArrowUp, Wrench, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui";
import type { PendingPlan, PlanStepClient } from "../../types";

export interface PlanNodeProps {
  pending: PendingPlan;
  disabled: boolean;
  onSubmit: (plan: PendingPlan["spec"]) => void;
  /** Dismiss the advisory plan locally (no server resume) so it stops being shown
   *  as actionable. Plans don't lock the composer (AI-02, two-gates contract). */
  onDismiss?: () => void;
}

/** Plan-preview worklog node with editing (remove + reorder + edit step text). The
 *  steps are advisory intent — the model re-derives the real write at the diff-gate;
 *  editing only refines what the model attempts (spec §4.1, two-gates contract). */
export function PlanNode({ pending, disabled, onSubmit, onDismiss }: PlanNodeProps) {
  const [steps, setSteps] = useState<PlanStepClient[]>(pending.spec.steps);
  const resolved = pending.resolved;
  const editable = !resolved && !disabled;

  const patch = (id: string, field: "title" | "rationale", value: string) =>
    setSteps((s) => s.map((step) => (step.id === id ? { ...step, [field]: value } : step)));
  const remove = (id: string) => setSteps((s) => s.filter((step) => step.id !== id));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  const ConfChip = ({ c }: { c: "high" | "low" }) => (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${
        c === "high" ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"
      }`}
    >
      {c === "high" ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldAlert className="h-2.5 w-2.5" />}
      {c === "high" ? "High" : "Low"}
    </span>
  );

  return (
    <div className="rounded-xl border border-accent-200 bg-accent-50/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <ListChecks className="h-3.5 w-3.5 text-accent-600" />
        <p className="text-sm font-semibold text-surface-900">{pending.spec.title}</p>
      </div>
      {pending.spec.description ? <p className="mb-2 text-xs text-surface-500">{pending.spec.description}</p> : null}
      <ol className="flex flex-col gap-1.5">
        {steps.map((step, i) => (
          <li key={step.id} className="flex items-start gap-2 rounded-lg border border-surface-200 bg-surface-0 px-2.5 py-2">
            <span className="mt-1 text-[11px] font-medium text-surface-400 tabular-nums">{i + 1}</span>
            {step.kind === "tool" ? <Wrench className="mt-1 h-3 w-3 flex-shrink-0 text-accent-500" /> : null}
            <div className="min-w-0 flex-1">
              {editable ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <Input
                      aria-label={`Step title: ${step.title}`}
                      value={step.title}
                      onChange={(e) => patch(step.id, "title", e.target.value)}
                      className="px-1 py-0.5 text-sm text-surface-800"
                    />
                    {step.confidence ? <ConfChip c={step.confidence} /> : null}
                  </div>
                  {step.rationale !== undefined ? (
                    <Input
                      aria-label={`Step rationale: ${step.title}`}
                      value={step.rationale}
                      onChange={(e) => patch(step.id, "rationale", e.target.value)}
                      placeholder="rationale"
                      className="mt-0.5 px-1 py-0.5 text-xs text-surface-500"
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 text-sm text-surface-700">
                    {step.title}
                    {step.confidence ? <ConfChip c={step.confidence} /> : null}
                  </span>
                  {step.rationale ? <span className="block text-xs text-surface-400">{step.rationale}</span> : null}
                </>
              )}
            </div>
            {editable ? (
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button type="button" aria-label={`Move step up: ${step.title}`} disabled={i === 0} onClick={() => move(i, -1)} className="text-surface-400 hover:text-surface-700 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Move step down: ${step.title}`} disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="text-surface-400 hover:text-surface-700 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Remove step: ${step.title}`} onClick={() => remove(step.id)} className="text-surface-400 hover:text-danger-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex justify-end gap-2">
        {onDismiss && !resolved ? (
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={disabled}>
            Dismiss
          </Button>
        ) : null}
        <Button size="sm" onClick={() => onSubmit({ ...pending.spec, steps })} disabled={disabled || resolved}>
          {resolved ? "Started" : "Proceed"}
        </Button>
      </div>
    </div>
  );
}
