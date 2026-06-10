"use client";

import { useState } from "react";
import Link from "next/link";
import { AsyncData, useQueryState } from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { KEYS } from "@/lib/swr";
import {
  useMcpConnections,
  useUserPreferences,
  type UserPreferencesDto,
} from "@/lib/swr/hooks";
import { glyphStyle } from "@/components/mcp/provider-colors";
import { ScopeBadge } from "@/components/mcp/scope-badge";
import { StatusPill } from "@/components/mcp/status-pill";
import { ToolSwitch } from "@/components/mcp/tool-switch";
import type { McpConnectionDto } from "@/components/mcp/types";

/**
 * ConnectionsPane — AI-sidebar pane (D11 per-user kill-switch).
 *
 * Lists the user's visible MCP connections. Connected ones get a switch:
 * toggled off → the connection's tools are removed from THIS user's Companion
 * context (persisted to `userPreferences.disabledMcpConnections`); the
 * connection itself stays connected for the rest of the team. Non-connected
 * rows show their status pill instead of a switch.
 *
 * Row anatomy (sidebar-pane pattern + placement.html card tokens): 22px brand
 * glyph, name + tool-count column, scope badge, right-aligned 30×18 switch.
 * Toggle = optimistic SWR mutate of the prefs key + PATCH, rolled back when
 * the server rejects (same idiom as ManageConnectionPanel's per-tool toggle).
 */
export function ConnectionsPane() {
  const connsSwr = useMcpConnections();
  const query = useQueryState(connsSwr);
  const prefsSwr = useUserPreferences();
  const [error, setError] = useState<string | null>(null);

  const disabled = new Set(prefsSwr.data?.disabledMcpConnections ?? []);

  /** Optimistic toggle; SWR rolls the prefs cache back when the PATCH fails. */
  async function toggle(id: string) {
    setError(null);
    const next = new Set(disabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const list = [...next];
    const apply = (cur: UserPreferencesDto | undefined): UserPreferencesDto => ({
      ...(cur ?? {}),
      disabledMcpConnections: list,
    });
    try {
      await prefsSwr.mutate(
        async (current) => {
          const res = await apiFetch(KEYS.userPreferences, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ disabledMcpConnections: list }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? "Failed to update connection");
          }
          return apply(current);
        },
        { optimisticData: apply, rollbackOnError: true, revalidate: false },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update connection");
    }
  }

  return (
    <div className="p-3">
      <AsyncData
        query={query}
        onRetry={() => void connsSwr.mutate()}
        compact
        emptyTitle="No connections yet"
        emptyBody={
          <>
            Connect external tools your Companion can use.{" "}
            <Link
              href="/connections"
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              Add a connection →
            </Link>
          </>
        }
      >
        {(connections) => (
          <>
            <div>
              {connections.map((c, i) => (
                <ConnectionRow
                  key={c.id}
                  connection={c}
                  divided={i > 0}
                  enabled={!disabled.has(c.id)}
                  onToggle={() => void toggle(c.id)}
                />
              ))}
            </div>
            {error && (
              <p role="alert" className="mt-2 text-xs text-danger-600">
                {error}
              </p>
            )}
            <p className="mt-3 border-t border-surface-100 pt-2.5 text-xs text-surface-500">
              Switched-off connections are removed from the Companion&apos;s
              context for you — they stay connected for your team.
            </p>
          </>
        )}
      </AsyncData>
    </div>
  );
}

function ConnectionRow({
  connection: c,
  divided,
  enabled,
  onToggle,
}: {
  connection: McpConnectionDto;
  divided: boolean;
  enabled: boolean;
  onToggle: () => void;
}) {
  const toolCount = c.capabilities?.tools.length ?? null;
  return (
    <div
      className={`flex items-center gap-[9px] py-2 ${
        divided ? "border-t border-surface-100" : ""
      }`}
    >
      <span
        aria-hidden
        className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] text-[11px] font-bold text-white"
        style={glyphStyle(c.slug)}
      >
        {c.name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-semibold text-surface-800">
          {c.name}
        </div>
        <div className="text-[11px] text-surface-500 tabular-nums">
          {toolCount ?? "—"} {toolCount === 1 ? "tool" : "tools"}
        </div>
      </div>
      <ScopeBadge scope={c.ownerScope} />
      {c.status === "connected" ? (
        <ToolSwitch
          checked={enabled}
          label={`Use ${c.name} in chat`}
          onToggle={onToggle}
        />
      ) : (
        <StatusPill status={c.status} authType={c.authType} />
      )}
    </div>
  );
}
