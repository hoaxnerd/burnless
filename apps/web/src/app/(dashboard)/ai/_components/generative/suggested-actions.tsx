"use client";

import { Button } from "@/components/ui/button";

export interface GenSuggestedAction {
  label: string;
  prompt: string;
}

export interface GenSuggestedActionsProps {
  actions: GenSuggestedAction[];
  /**
   * Sends `action.prompt` as a new chat turn when a button is clicked. Threaded
   * from <GenerativeBlock>'s `onAction` (page → chat-message-list → dispatcher).
   * When absent the buttons render but are inert.
   */
  onAction?: (prompt: string) => void;
}

/**
 * Interactive row of model-authored suggested next-steps. Each button sends its
 * follow-up prompt back through the chat session. Content is model-authored —
 * this renderer shows no financial data on its own.
 */
export function GenSuggestedActions({ actions, onAction }: GenSuggestedActionsProps) {
  if (!actions || actions.length === 0) {
    return (
      <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
        No suggested actions.
      </div>
    );
  }

  return (
    <div className="my-2 flex flex-wrap gap-2">
      {actions.map((action, i) => (
        <Button
          key={i}
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => onAction?.(action.prompt)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
