"use client";

import { useState } from "react";
import {
  AsyncData,
  Button,
  Modal,
  useConfirm,
  useQueryState,
} from "@/components/ui";
import { apiFetch } from "@/lib/api-fetch";
import { KEYS, revalidate } from "@/lib/swr";
import { useMcpConnectionTools } from "@/lib/swr/hooks";
import { glyphStyle } from "./provider-colors";
import { PermClassTag } from "./perm-class-tag";
import { StatusPill } from "./status-pill";
import type { McpConnectionDto, McpToolDto } from "./types";

/**
 * ManageConnectionPanel — per-tool control + remove/authenticate for one
 * connection.
 *
 * Mockup: tools-in-chat.html right column "Per-connection tool control" card —
 * `.toolrow` rows (9px gap, 8px vertical padding, surface-100 hairline between
 * rows), mono 11.5px tool name, `.rd` perm chip pushed right, 30×18 switch
 * (brand-500 on / surface-300 off, 14px knob).
 *
 * Toggle = optimistic SWR mutate + `PATCH /api/mcp/connections/[id]/tools`,
 * rolled back when the server rejects. Remove = ConfirmDialog → DELETE →
 * revalidate the connections list + close. Non-connected connections get an
 * Authenticate row (same full-page OAuth redirect as the add flow, Task 3).
 */
export interface ManageConnectionPanelProps {
  connection: McpConnectionDto | null;
  onClose: () => void;
}

/** Switch — mockup `.sw`: 30×18 pill, brand-500 on / surface-300 off, 14px knob. */
function ToolSwitch({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-[18px] w-[30px] flex-none rounded-full transition-colors ${
        checked ? "bg-brand-500" : "bg-surface-300"
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-3" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function ManageConnectionPanel({
  connection,
  onClose,
}: ManageConnectionPanelProps) {
  const toolsSwr = useMcpConnectionTools(connection?.id ?? null);
  const query = useQueryState(toolsSwr);
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // authorize / remove in flight

  if (!connection) return null;
  const { id, name } = connection;

  const toolCount = toolsSwr.data?.length ?? connection.capabilities?.tools.length;
  const scopeLabel = connection.ownerScope === "personal" ? "Personal" : "Company";
  const title = `${connection.name} · ${scopeLabel}${
    toolCount != null ? ` · ${toolCount} tools` : ""
  }`;

  /** Optimistic per-tool toggle; SWR rolls the cache back when the PATCH fails. */
  async function toggleTool(tool: McpToolDto) {
    setError(null);
    const next = !tool.enabled;
    const apply = (list: McpToolDto[] | undefined) =>
      (list ?? []).map((t) => (t.name === tool.name ? { ...t, enabled: next } : t));
    try {
      await toolsSwr.mutate(
        async (current) => {
          const res = await apiFetch(KEYS.mcpConnectionTools(id), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolName: tool.name, enabled: next }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? "Failed to update tool");
          }
          return apply(current);
        },
        { optimisticData: apply, rollbackOnError: true, revalidate: false },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update tool");
    }
  }

  /** Same full-page OAuth redirect as the add flow (Task 3). */
  async function handleAuthorize() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/mcp/connections/${id}/authorize`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.authorizationUrl) {
        setError(data.error ?? "Failed to start authorization");
        setBusy(false);
        return;
      }
      // Full-page redirect; deliberately KEEP busy=true until navigation
      // unloads the page (no idle flicker mid-redirect).
      window.location.assign(data.authorizationUrl);
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (busy) return;
    const ok = await confirm({
      title: "Remove connection?",
      body: `${name} will be disconnected and your Companion will lose access to its tools.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(KEYS.mcpConnection(id), { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed to remove connection");
        setBusy(false);
        return;
      }
      void revalidate(KEYS.mcpConnections);
      setBusy(false);
      onClose();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={title}
        size="md"
        icon={
          <span
            aria-hidden
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] text-[13px] font-bold text-white"
            style={glyphStyle(connection.slug)}
          >
            {connection.name.charAt(0).toUpperCase()}
          </span>
        }
      >
        {connection.status !== "connected" && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-warning-100 bg-warning-50 px-3 py-2.5">
            <StatusPill status={connection.status} authType={connection.authType} />
            <span className="min-w-0 truncate text-xs text-surface-600">
              Sign in to use this connection.
            </span>
            <Button
              size="sm"
              className="ml-auto flex-none"
              state={busy ? "loading" : "idle"}
              onClick={() => void handleAuthorize()}
            >
              Authenticate
            </Button>
          </div>
        )}

        <p className="mb-2.5 text-xs text-surface-500">
          Reads auto-run; writes and deletes ask first. Toggle off any tool your
          Companion shouldn&apos;t use.
        </p>

        <AsyncData
          query={query}
          onRetry={() => void toolsSwr.mutate()}
          compact
          emptyTitle="No tools discovered"
          emptyBody="This server hasn't reported any tools yet — authenticate or refresh to discover them."
        >
          {(tools) => (
            <div>
              {tools.map((tool, i) => (
                <div
                  key={tool.name}
                  className={`flex items-center gap-[9px] py-2 ${
                    i > 0 ? "border-t border-surface-100" : ""
                  }`}
                >
                  <span
                    className="min-w-0 truncate font-mono text-[11.5px] font-medium tracking-[-0.01em] text-surface-700"
                    title={tool.description ?? undefined}
                  >
                    {tool.name}
                  </span>
                  <span className="ml-auto flex-none">
                    <PermClassTag cls={tool.permClass} />
                  </span>
                  <ToolSwitch
                    checked={tool.enabled}
                    label={`Enable ${tool.name}`}
                    onToggle={() => void toggleTool(tool)}
                  />
                </div>
              ))}
            </div>
          )}
        </AsyncData>

        <div className="mt-4 border-t border-surface-100 pt-3">
          {error && (
            <p role="alert" className="mb-2 text-xs text-danger-600">
              {error}
            </p>
          )}
          {/* Danger-ghost text action — same idiom as billing-tab's Cancel subscription. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRemove()}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50"
          >
            Remove connection
          </button>
        </div>
      </Modal>
      {dialog}
    </>
  );
}
