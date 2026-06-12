"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-fetch";
import { KEYS } from "@/lib/swr";
import {
  useUserPreferences,
  useSessionDisabledTools,
  type UserPreferencesDto,
} from "@/lib/swr/hooks";
import type { McpToolDto } from "@/components/mcp/types";
import { Button } from "@/components/ui/button";
import { ConnectorsCategory } from "./connectors-category";
import { WebCategory } from "./web-category";
import { WorkspaceCategory } from "./workspace-category";
import type { ToolsCtx } from "./tools-ctx";

/**
 * ToolsPane (S3b §4, §8, §12) — the orchestrator for the unified Tools pane.
 *
 * Owns the two enablement layers and the callbacks that write them:
 *   • Permanent (per-user): `userPreferences.disabledMcpConnections` /
 *     `disabledBuiltinTools`, plus team-wide per-tool prefs on a connection.
 *   • Session (per-chat): `aiConversations.sessionDisabledTools`.
 *
 * It builds the shared {@link ToolsCtx} and hands it to the three self-labelling
 * category components (each already wraps itself in `CategorySection`, so the
 * orchestrator does NOT re-wrap them). Effective enablement is derived per row
 * by the categories themselves (`!permanent && !session[key]`).
 *
 * `keepPermanent` is routed by key prefix (see ToolsCtx doc): `conn:` and
 * `builtin:` PATCH user-preferences; `conntool:<id>:<tool>` PATCHes that
 * connection's tools endpoint. On a successful permanent write while a chat is
 * active, the now-redundant per-chat override for that key is cleared
 * (spec §4: "the session-map key is cleared on promotion").
 */
export function ToolsPane({ conversationId }: { conversationId: string | null }) {
  const { mutate } = useSWRConfig();
  const prefsSwr = useUserPreferences();
  const sessionSwr = useSessionDisabledTools(conversationId);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefs = prefsSwr.data;
  const sessionDisabled = sessionSwr.data ?? {};
  const disabledConnections = new Set(prefs?.disabledMcpConnections ?? []);
  const disabledBuiltins = new Set(prefs?.disabledBuiltinTools ?? []);

  const sessionKey = conversationId ? KEYS.sessionDisabledTools(conversationId) : null;

  /** Flip the per-chat session layer for `key` (optimistic + rollback). */
  async function toggleSession(key: string, disabled: boolean): Promise<void> {
    if (conversationId == null || sessionKey == null) return; // no session layer
    setError(null);
    const apply = (cur: Record<string, boolean> | undefined): Record<string, boolean> => {
      const next = { ...(cur ?? {}) };
      if (disabled) next[key] = true;
      else delete next[key];
      return next;
    };
    try {
      await mutate(
        sessionKey,
        async (current: Record<string, boolean> | undefined) => {
          const res = await apiFetch("/api/chat/session-tools", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId, key, disabled }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? "Failed to update tool for this chat");
          }
          return apply(current);
        },
        { optimisticData: apply, rollbackOnError: true, revalidate: false },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update tool for this chat");
    }
  }

  /** Patch user-preferences (`disabledMcpConnections`/`disabledBuiltinTools`)
   *  optimistically, rolling back the prefs cache on a server reject. */
  async function patchPrefs(
    field: "disabledMcpConnections" | "disabledBuiltinTools",
    id: string,
    disabled: boolean,
  ): Promise<void> {
    const current = new Set(
      (field === "disabledMcpConnections"
        ? prefs?.disabledMcpConnections
        : prefs?.disabledBuiltinTools) ?? [],
    );
    if (disabled) current.add(id);
    else current.delete(id);
    const list = [...current];
    const apply = (cur: UserPreferencesDto | undefined): UserPreferencesDto => ({
      ...(cur ?? {}),
      [field]: list,
    });
    await prefsSwr.mutate(
      async (cur) => {
        const res = await apiFetch(KEYS.userPreferences, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: list }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Failed to update preferences");
        }
        return apply(cur);
      },
      { optimisticData: apply, rollbackOnError: true, revalidate: false },
    );
  }

  /** PATCH a connection's per-tool prefs (team-wide) optimistically. */
  async function patchConnTool(
    connectionId: string,
    toolName: string,
    disabled: boolean,
  ): Promise<void> {
    const key = KEYS.mcpConnectionTools(connectionId);
    const enabled = !disabled;
    const apply = (list: McpToolDto[] | undefined): McpToolDto[] =>
      (list ?? []).map((t) => (t.name === toolName ? { ...t, enabled } : t));
    await mutate(
      key,
      async (current: McpToolDto[] | undefined) => {
        const res = await apiFetch(key, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolName, enabled }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Failed to update tool");
        }
        return apply(current);
      },
      { optimisticData: apply, rollbackOnError: true, revalidate: false },
    );
  }

  /** Promote a row to the permanent layer, routed by key prefix. After a
   *  successful write, clear any redundant per-chat override for the same key. */
  async function keepPermanent(key: string, disabled: boolean): Promise<void> {
    setError(null);
    try {
      if (key.startsWith("conn:")) {
        await patchPrefs("disabledMcpConnections", key.slice("conn:".length), disabled);
      } else if (key.startsWith("builtin:")) {
        await patchPrefs("disabledBuiltinTools", key.slice("builtin:".length), disabled);
      } else if (key.startsWith("conntool:")) {
        const rest = key.slice("conntool:".length);
        const sep = rest.indexOf(":");
        const connectionId = rest.slice(0, sep);
        const toolName = rest.slice(sep + 1);
        await patchConnTool(connectionId, toolName, disabled);
      } else {
        return;
      }
      // Promotion makes the per-chat override redundant — clear it (best effort).
      if (conversationId != null && sessionDisabled[key] === true) {
        await toggleSession(key, false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update preferences");
    }
  }

  const ctx: ToolsCtx = {
    conversationId,
    sessionDisabled,
    disabledConnections,
    disabledBuiltins,
    toggleSession,
    keepPermanent,
  };

  async function resetSessionGrants(): Promise<void> {
    if (conversationId == null || resetting) return;
    setResetting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/chat/reset-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to reset session grants");
      }
      if (sessionKey != null) await mutate(sessionKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset session grants");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="p-3">
      <ConnectorsCategory ctx={ctx} />
      <WebCategory ctx={ctx} />
      <WorkspaceCategory ctx={ctx} />

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger-600">
          {error}
        </p>
      )}

      <p className="mt-3 border-t border-surface-100 pt-2.5 text-xs leading-[1.45] text-surface-500">
        Switches default to <strong className="font-semibold">this chat only</strong>.
        Use “Keep permanently” to apply a change across every chat — those persist
        on your account.
      </p>

      {conversationId != null && (
        <div className="mt-2.5">
          <Button
            size="sm"
            variant="ghost"
            state={resetting ? "loading" : "idle"}
            onClick={() => void resetSessionGrants()}
          >
            Reset session grants for this chat
          </Button>
        </div>
      )}
    </div>
  );
}
