import { Sparkles } from "lucide-react";

interface ConfidenceBadgeProps {
  confidence: string;
  source: string;
}

export function ConfidenceBadge({ confidence, source }: ConfidenceBadgeProps) {
  if (source === "user") return null;
  if (source === "default") return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        confidence === "high"
          ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-500"
          : confidence === "medium"
            ? "bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-500"
            : "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400"
      }`}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {confidence === "high" ? "AI confident" : confidence === "medium" ? "AI guess" : "AI low"}
    </span>
  );
}
