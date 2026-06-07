// apps/web/src/app/(dashboard)/ai/_components/timeline/nodes/result-node.tsx
"use client";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { GenerativeBlock } from "../../generative/generative-block";
import { ConfidenceChip } from "../../generative/confidence-chip";
import { ResultContainer } from "../result-container";
import type { TimelineNodeClient } from "../../types";

/** A worklog result node: streamed prose and/or a rendered genui component, with
 *  the binary confidence chip + rationale beneath (spec §4.3/§4.5/§7.2). */
export function ResultNode({ node, onAction }: { node: TimelineNodeClient; onAction?: (prompt: string) => void }) {
  return (
    <div className="min-w-0">
      {node.text ? (
        <div className="text-sm leading-relaxed text-surface-800">
          <MarkdownRenderer content={node.text} />
        </div>
      ) : null}
      {node.block ? (
        <ResultContainer>
          <GenerativeBlock component={node.block.component} props={node.block.props} onAction={onAction} />
        </ResultContainer>
      ) : null}
      <ConfidenceChip confidence={node.confidence} rationale={node.rationale} />
    </div>
  );
}
