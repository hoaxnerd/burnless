"use client";

import { useState } from "react";
import { Eye, Pencil, Trash2, Globe, MonitorPlay, ChevronDown, ShieldCheck } from "lucide-react";
import { parseMcpToolName } from "@burnless/mcp/tool-bridge";
import { Button } from "@/components/ui/button";
import { DiffGate } from "./generative/diff-gate";
import type { PendingPermission, PermissionCategoryId, PermissionDecisionKind } from "./types";

const CATEGORY_ICON: Record<PermissionCategoryId, React.ReactNode> = {
  read: <Eye className="h-4 w-4" />,
  write: <Pencil className="h-4 w-4" />,
  delete: <Trash2 className="h-4 w-4" />,
  web_search: <Globe className="h-4 w-4" />,
  browser_use: <MonitorPlay className="h-4 w-4" />,
};

interface Decision {
  requestId: string;
  decision: PermissionDecisionKind;
}

/** Turn a camelCase / snake_case input key into a readable label. */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** MCP tools show as "slug · tool" in mono (tools-in-chat.html `.perm` body row);
 *  native tools keep the humanized label. */
function toolLabel(tool: string): React.ReactNode {
  const mcp = parseMcpToolName(tool);
  return mcp ? <span className="font-mono">{`${mcp.slug} · ${mcp.tool}`}</span> : humanizeKey(tool);
}

/** Render a tool-input value without dumping raw JSON to the approval surface. */
function humanizeValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(humanizeValue).join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${humanizeKey(k)}: ${humanizeValue(val)}`)
      .join(", ");
  }
  return String(v);
}

export function PermissionCard({
  pending,
  onDecide,
}: {
  pending: PendingPermission;
  onDecide: (decisions: Decision[]) => void;
}) {
  const [showInput, setShowInput] = useState(false);
  const multi = pending.actions.length > 1;

  if (pending.resolved) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-xs text-surface-500 flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-surface-400" />
        Permission resolved.
      </div>
    );
  }

  const decideAll = (decision: PermissionDecisionKind) =>
    onDecide(pending.actions.map((a) => ({ requestId: a.requestId, decision })));

  const hasDelete = pending.actions.some((a) => a.category === "delete");
  const diffActions = pending.actions.filter((a) => a.override && a.override.length > 0);
  const hasDiff = diffActions.length > 0;

  return (
    <div className="rounded-2xl border border-accent-200 bg-accent-50/40 p-4 animate-slide-up">
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-surface-800">
        <span className="text-accent-600">{CATEGORY_ICON[pending.actions[0]!.category]}</span>
        {multi ? `${pending.actions.length} actions need your approval` : "Approve this action?"}
      </div>

      {hasDiff
        ? diffActions.map((a) => <DiffGate key={a.requestId} override={a.override!} />)
        : null}

      <ul className="space-y-1.5 mb-3">
        {pending.actions.map((a) => (
          <li key={a.requestId} className="flex items-center gap-2 text-sm text-surface-700">
            <span className="text-surface-400">{CATEGORY_ICON[a.category]}</span>
            <span>
              Wants to: <span className="font-medium">{a.description}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setShowInput((s) => !s)}
        className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 mb-2"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${showInput ? "rotate-180" : ""}`} />
        {showInput ? "Hide details" : "Show details"}
      </button>
      {showInput && (
        <div className="mb-3 max-h-40 overflow-auto rounded-lg bg-surface-100 p-3 text-[11px] text-surface-600 space-y-2">
          {pending.actions.map((a) => {
            const entries = Object.entries(
              (a.input as Record<string, unknown> | undefined) ?? {},
            );
            return (
              <div key={a.requestId}>
                <p className="font-medium text-surface-700">{toolLabel(a.tool)}</p>
                {entries.length === 0 ? (
                  <p className="text-surface-400">No parameters.</p>
                ) : (
                  <ul className="mt-0.5 space-y-0.5">
                    {entries.map(([k, val]) => (
                      <li key={k} className="grid grid-cols-[minmax(0,8rem)_1fr] gap-2">
                        <span className="truncate text-surface-500">{humanizeKey(k)}</span>
                        <span className="break-words tabular-nums">{humanizeValue(val)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => decideAll("once")}>
          {hasDiff ? (multi ? "Apply all" : "Apply") : multi ? "Allow all once" : "Allow once"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => decideAll("session")}>
          Allow for session
        </Button>
        <Button size="sm" variant="ghost" onClick={() => decideAll("deny")}>
          {hasDiff ? "Cancel" : "Deny"}
        </Button>
      </div>

      {hasDelete && (
        <p className="mt-2 text-[11px] text-surface-400">
          Deletes can be allowed for this chat only — never permanently.
        </p>
      )}
    </div>
  );
}
