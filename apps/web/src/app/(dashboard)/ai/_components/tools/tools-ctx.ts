/**
 * Shared prop/callback contract for the unified Tools pane (S3b §4, §8).
 *
 * The orchestrator (`tools-pane.tsx`) owns the SWR mutates + the two enablement
 * callbacks; the three category components are mostly presentational (they do
 * their own domain SWR reads but route every mutation through this context).
 *
 * Per row:
 *   effectiveEnabled    = !permanentDisabled && !sessionDisabled[key]
 *   isPermanentlyDisabled = permanentDisabled
 * Bind `EnableSwitch.onToggleSession = (d) => toggleSession(key, d)` and
 * `onKeepPermanently = (d) => keepPermanent(key, d)`.
 */
export interface ToolsCtx {
  /** Active conversation, or null when there is no per-chat session layer. */
  conversationId: string | null;
  /** Per-conversation session-disabled map (`useSessionDisabledTools`). */
  sessionDisabled: Record<string, boolean>;
  /** Permanent per-user disabled connection IDs (`prefs.disabledMcpConnections`). */
  disabledConnections: Set<string>;
  /** Permanent per-user disabled built-in tool names (`prefs.disabledBuiltinTools`). */
  disabledBuiltins: Set<string>;
  /**
   * Flip the per-chat session layer for `key`. PATCH /api/chat/session-tools +
   * optimistic mutate of the session-disabled SWR key (rollback on error).
   */
  toggleSession: (key: string, disabled: boolean) => Promise<void>;
  /**
   * Promote to the permanent layer, routed by key prefix:
   *   "conn:<id>"            → prefs.disabledMcpConnections (PATCH /api/user-preferences)
   *   "builtin:<name>"       → prefs.disabledBuiltinTools   (PATCH /api/user-preferences)
   *   "conntool:<id>:<tool>" → PATCH /api/mcp/connections/<id>/tools { toolName, enabled }
   */
  keepPermanent: (key: string, disabled: boolean) => Promise<void>;
}
