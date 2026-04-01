"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ScenarioBadge } from "./scenario-badge";
import type { OverrideInfo } from "./use-scenario-overrides";

interface HiddenEntitiesSectionProps {
  deletedEntities: OverrideInfo[];
  entityLabel: string;
  onRestore: (entityId: string) => Promise<void>;
}

/**
 * Collapsed section at the bottom of an entity list showing entities
 * that have been "hidden" (deleted) in the active scenario.
 * Each entity has a "Restore" button that deletes the delete-override.
 */
export function HiddenEntitiesSection({
  deletedEntities,
  entityLabel,
  onRestore,
}: HiddenEntitiesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  if (deletedEntities.length === 0) return null;

  async function handleRestore(entityId: string) {
    setRestoringId(entityId);
    try {
      await onRestore(entityId);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-surface-300 bg-surface-50/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-100/50 transition-colors rounded-xl"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-surface-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-surface-400" />
        )}
        <span className="text-sm font-medium text-surface-500">
          Hidden in scenario ({deletedEntities.length})
        </span>
        <ScenarioBadge variant="deleted" />
      </button>

      {isExpanded && (
        <div className="border-t border-dashed border-surface-300 divide-y divide-surface-200">
          {deletedEntities.map((entity) => {
            const name =
              entity.entityName ??
              (entity.data?.name as string | undefined) ??
              (entity.data?.title as string | undefined) ??
              entity.entityId;

            return (
              <div
                key={entity.entityId}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-surface-500 line-through truncate">
                    {name}
                  </span>
                  <span className="text-[10px] text-surface-400">
                    {entityLabel}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Undo2 className="h-3 w-3" />}
                  onClick={() => handleRestore(entity.entityId)}
                  disabled={restoringId === entity.entityId}
                >
                  {restoringId === entity.entityId ? "Restoring..." : "Restore"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
