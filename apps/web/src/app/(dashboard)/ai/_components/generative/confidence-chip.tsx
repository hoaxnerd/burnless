// apps/web/src/app/(dashboard)/ai/_components/generative/confidence-chip.tsx
"use client";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export interface ConfidenceChipProps {
  confidence?: "high" | "low";
  rationale?: string;
}

/**
 * Binary confidence chip + one-line "because you said X" rationale (spec §4.3).
 * Binary High/Low only — never numeric or a color scale. Renders nothing when the
 * model supplied neither field (the default until the Plan 5 prompt populates them).
 */
export function ConfidenceChip({ confidence, rationale }: ConfidenceChipProps) {
  if (!confidence && !rationale) return null;
  const high = confidence === "high";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-surface-500">
      {confidence ? (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${
            high ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"
          }`}
        >
          {high ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
          {high ? "High confidence" : "Low confidence"}
        </span>
      ) : null}
      {rationale ? <span className="min-w-0">{rationale}</span> : null}
    </div>
  );
}
