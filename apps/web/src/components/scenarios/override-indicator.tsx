"use client";

import type { ReactNode } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ScenarioBadge } from "./scenario-badge";

interface OverrideIndicatorProps {
  override: "modified" | "created" | null;
  entityName: string;
  /** Revert a modified entity back to base values */
  onRevert?: () => void;
  /** Remove a scenario-only entity */
  onRemove?: () => void;
  children: ReactNode;
}

export function OverrideIndicator({
  override,
  entityName,
  onRevert,
  onRemove,
  children,
}: OverrideIndicatorProps) {
  // Null override — render children with zero overhead
  if (!override) {
    return <>{children}</>;
  }

  const isModified = override === "modified";

  return (
    <div
      className={`relative border-l-3 ${
        isModified ? "border-l-warning-500" : "border-l-success-500"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-medium text-surface-700 dark:text-surface-300">
            {entityName}
          </span>
          <ScenarioBadge variant={override} />
        </div>

        {isModified && onRevert && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="h-3 w-3" />}
            onClick={onRevert}
          >
            Revert
          </Button>
        )}

        {!isModified && onRemove && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="h-3 w-3" />}
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>

      {children}
    </div>
  );
}
