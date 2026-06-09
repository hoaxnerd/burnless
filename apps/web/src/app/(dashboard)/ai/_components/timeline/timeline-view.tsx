// apps/web/src/app/(dashboard)/ai/_components/timeline/timeline-view.tsx
"use client";
import { ListChecks, Wrench, GitCompareArrows, MessageSquareText, FormInput, GitBranch } from "lucide-react";
import { PlanNode } from "./nodes/plan-node";
import { ToolNode } from "./nodes/tool-node";
import { DiffGateNode } from "./nodes/diff-gate-node";
import { InputNode } from "./nodes/input-node";
import { ResultNode } from "./nodes/result-node";
import { ScenarioNode } from "./nodes/scenario-node";
import type { TimelineNodeClient, PendingPermission, PendingPlan, PendingInput } from "../types";

const RAIL_ICON: Record<TimelineNodeClient["kind"], React.ReactNode> = {
  plan: <ListChecks className="h-3 w-3" />,
  tool: <Wrench className="h-3 w-3" />,
  diff_gate: <GitCompareArrows className="h-3 w-3" />,
  result: <MessageSquareText className="h-3 w-3" />,
  input: <FormInput className="h-3 w-3" />,
  scenario: <GitBranch className="h-3 w-3" />,
};

export interface TimelineViewProps {
  nodes: TimelineNodeClient[];
  disabled: boolean;
  onPlanSubmit: (pending: PendingPlan, plan: PendingPlan["spec"]) => void;
  /** Locally dismiss an advisory plan node without a server resume (AI-02). */
  onPlanDismiss?: (pending: PendingPlan) => void;
  onDecide: (pending: PendingPermission, decisions: { requestId: string; decision: "once" | "session" | "deny" }[]) => void;
  onInputSubmit: (pending: PendingInput, data: Record<string, unknown>) => void;
  onAction?: (prompt: string) => void;
}

/** The agentic worklog (spec §4.5): an ordered node list on a left connector rail. */
export function TimelineView({ nodes, disabled, onPlanSubmit, onPlanDismiss, onDecide, onInputSubmit, onAction }: TimelineViewProps) {
  return (
    <ol className="relative flex flex-col gap-3 pl-6">
      {/* connector rail */}
      <span aria-hidden className="absolute left-[7px] top-1 bottom-1 w-px bg-surface-200" />
      {nodes.map((node) => (
        <li key={node.id} className="relative">
          <span aria-hidden className="absolute -left-6 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-0 text-surface-400 ring-2 ring-surface-0">
            {RAIL_ICON[node.kind]}
          </span>
          {node.kind === "plan" && node.plan ? (
            <PlanNode pending={node.plan} disabled={disabled} onSubmit={(spec) => onPlanSubmit(node.plan!, spec)} onDismiss={onPlanDismiss ? () => onPlanDismiss(node.plan!) : undefined} />
          ) : node.kind === "tool" ? (
            <ToolNode node={node} />
          ) : node.kind === "diff_gate" && node.pending ? (
            <DiffGateNode pending={node.pending} onDecide={onDecide} />
          ) : node.kind === "input" && node.input ? (
            <InputNode pending={node.input} disabled={disabled} onSubmit={onInputSubmit} />
          ) : node.kind === "result" ? (
            <ResultNode node={node} onAction={onAction} />
          ) : node.kind === "scenario" ? (
            <ScenarioNode node={node} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
