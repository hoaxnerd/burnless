"use client";

import { CurrencyInput } from "@/components/forms/primitives";
import { MilestoneEditor } from "./MilestoneEditor";

interface Milestone {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  hitDate?: string;
}

interface GrantFieldsProps {
  params: {
    milestones: Milestone[];
    matchRequirement?: { requiredAmount: number; asOf: string };
  };
  setParameters: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

export function GrantFields({ params, setParameters }: GrantFieldsProps) {
  const setMatch = (patch: Partial<NonNullable<GrantFieldsProps["params"]["matchRequirement"]>>) =>
    setParameters((p) => {
      const current = (p.matchRequirement ?? { requiredAmount: 0, asOf: "" }) as {
        requiredAmount: number;
        asOf: string;
      };
      return { ...p, matchRequirement: { ...current, ...patch } };
    });

  return (
    <div className="space-y-4">
      <MilestoneEditor
        milestones={params.milestones ?? []}
        onChange={(next) => setParameters((p) => ({ ...p, milestones: next }))}
      />

      <div className="pt-4 border-t">
        <div className="text-sm font-medium mb-2">Match Requirement (optional)</div>
        <CurrencyInput
          value={params.matchRequirement?.requiredAmount ?? 0}
          onChange={(v) => setMatch({ requiredAmount: v })}
          label="Required Internal Spend"
          hint="Cumulative company spend that must occur by the date below."
        />
        <div className="mt-2">
          <label className="text-sm font-medium">Match As-Of Date</label>
          <input
            type="date"
            className="input"
            value={params.matchRequirement?.asOf ?? ""}
            onChange={(e) => setMatch({ asOf: e.target.value })}
          />
        </div>
        <div className="text-xs text-muted mt-1">
          Engine emits a GrantMatchWarning if cumulative qualifying spend at any
          milestone&apos;s hit date falls short of this amount.
        </div>
      </div>
    </div>
  );
}
