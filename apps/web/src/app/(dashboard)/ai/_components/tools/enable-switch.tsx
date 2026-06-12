"use client";

import { useState } from "react";
import { Pin, X } from "lucide-react";
import { ToolSwitch } from "@/components/mcp/tool-switch";

/**
 * EnableSwitch — the single definition of session-vs-permanent enablement for
 * the unified Tools pane (S3b §4). Reused by all three Tool categories
 * (Connectors / per-tool / built-in Workspace tools).
 *
 * Mechanism:
 *  - Toggling the {@link ToolSwitch} flips the EFFECTIVE state. When a
 *    conversation exists, the change lands on the per-chat session layer
 *    (`onToggleSession`). When the new session state diverges from the
 *    permanent layer, the inline `.savep` prompt offers "Keep permanently"
 *    (promotes via `onKeepPermanently`) or dismiss (leaves the session toggle).
 *  - With no conversation (`conversationId == null`) there is no session layer,
 *    so a toggle writes the permanent layer directly (`onKeepPermanently`).
 *  - The {@link Pin} affordance reflects `isPermanentlyDisabled` (filled/brand
 *    when this row is governed permanently) and toggles permanence directly.
 *
 * Presentational + local-prompt-state ONLY: optimistic SWR mutate / rollback is
 * the orchestrator's job (it owns the caller callbacks). Mockup tokens:
 * `.sw` (ToolSwitch), `.pin`, `.savep` from unified-pane.html.
 */
export interface EnableSwitchProps {
  /** Effective state: permanent-on AND not session-disabled. */
  enabled: boolean;
  /** Permanent-layer state (drives the pin's filled/on look). */
  isPermanentlyDisabled: boolean;
  /** null => no session layer exists (toggle writes permanent directly). */
  conversationId: string | null;
  /** "conn:<id>" | "conntool:<id>:<tool>" | "builtin:<name>" */
  sessionKey: string;
  /** Caller PATCHes /api/chat/session-tools. */
  onToggleSession: (disabled: boolean) => Promise<void>;
  /** Caller promotes to the permanent layer. */
  onKeepPermanently: (disabled: boolean) => Promise<void>;
  /** a11y label for the switch. */
  label: string;
}

export function EnableSwitch({
  enabled,
  isPermanentlyDisabled,
  conversationId,
  sessionKey,
  onToggleSession,
  onKeepPermanently,
  label,
}: EnableSwitchProps) {
  // Local prompt visibility only. `divergesDisabled` records the session state
  // that diverged from permanent, so [Keep permanently] promotes the same value.
  const [promptDisabled, setPromptDisabled] = useState<boolean | null>(null);

  async function handleToggle() {
    const nextDisabled = enabled; // flipping the effective state → now disabled iff was enabled
    if (conversationId == null) {
      // No per-chat layer — the toggle writes the permanent layer directly.
      setPromptDisabled(null);
      await onKeepPermanently(nextDisabled);
      return;
    }
    await onToggleSession(nextDisabled);
    // Show the inline prompt only while the session state diverges from permanent.
    if (nextDisabled !== isPermanentlyDisabled) {
      setPromptDisabled(nextDisabled);
    } else {
      setPromptDisabled(null);
    }
  }

  async function handleKeepPermanently() {
    if (promptDisabled == null) return;
    const disabled = promptDisabled;
    setPromptDisabled(null);
    await onKeepPermanently(disabled);
  }

  async function handlePinToggle() {
    // Pin toggles permanence directly: flip the permanent-layer state.
    setPromptDisabled(null);
    await onKeepPermanently(!isPermanentlyDisabled);
  }

  // `sessionKey` keys this control within its category; surfaced for testability
  // and as a stable hook the orchestrator can correlate, not a render concern.
  const pinOn = isPermanentlyDisabled;

  return (
    <div data-session-key={sessionKey}>
      <div className="flex items-center gap-[7px]">
        <button
          type="button"
          aria-pressed={pinOn}
          aria-label={`Pin permanently — ${label}`}
          onClick={() => void handlePinToggle()}
          className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md transition-colors ${
            pinOn ? "bg-brand-50 text-brand-600" : "text-surface-300 hover:text-surface-400"
          }`}
        >
          <Pin className="h-[13px] w-[13px]" />
        </button>
        <ToolSwitch checked={enabled} label={label} onToggle={() => void handleToggle()} />
      </div>

      {promptDisabled != null && (
        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-[9px] py-[7px]">
          <span className="text-[10.5px] leading-[1.35] text-brand-700">
            Off for <b className="font-bold">this chat</b>. Keep it off in future chats too?
          </span>
          <span className="ml-auto flex flex-none items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleKeepPermanently()}
              className="whitespace-nowrap rounded-md border border-brand-300 bg-surface-0 px-2 py-[3px] text-[10.5px] font-semibold text-brand-700"
            >
              Keep permanently
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setPromptDisabled(null)}
              className="flex items-center px-1 py-[3px] text-[10.5px] text-surface-500"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
