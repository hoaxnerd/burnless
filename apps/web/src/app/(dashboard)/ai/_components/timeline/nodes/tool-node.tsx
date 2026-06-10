// apps/web/src/app/(dashboard)/ai/_components/timeline/nodes/tool-node.tsx
"use client";
import { Wrench, Loader2, Check, AlertTriangle } from "lucide-react";
import { parseMcpToolName } from "@burnless/mcp";
import { SourceChip } from "@/components/mcp/source-chip";
import { McpBadge } from "@/components/mcp/mcp-badge";
import { PermClassTag } from "@/components/mcp/perm-class-tag";
import type { TimelineNodeClient } from "../../types";

function humanize(tool: string): string {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A worklog tool node: the tool the model invoked, with live phase.
 *  MCP tools (mcp__<slug>__<tool>) render as source chip + bare mono tool name
 *  + MCP badge (+ read/write/delete tag when known) — tools-in-chat.html `.step`. */
export function ToolNode({ node }: { node: TimelineNodeClient }) {
  const phase = node.phase ?? "pending";
  const icon =
    phase === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-500" />
    : phase === "done" ? <Check className="h-3.5 w-3.5 text-success-600" />
    : phase === "error" ? <AlertTriangle className="h-3.5 w-3.5 text-danger-600" />
    : <Wrench className="h-3.5 w-3.5 text-surface-400" />;
  const mcp = parseMcpToolName(node.toolName ?? "");
  const cls =
    node.category === "read" || node.category === "write" || node.category === "delete"
      ? node.category
      : null;
  return (
    <div className="flex items-center gap-2 text-xs text-surface-600">
      {icon}
      {mcp ? (
        <>
          <SourceChip slug={mcp.slug} />
          <span className="font-mono text-xs text-surface-800">{mcp.tool}</span>
          <McpBadge />
          {cls ? <PermClassTag cls={cls} /> : null}
        </>
      ) : (
        <span className="font-medium text-surface-700">{humanize(node.toolName ?? "tool")}</span>
      )}
      {phase === "running" ? <span className="text-surface-400">running…</span> : null}
      {phase === "error" ? <span className="text-danger-500">failed</span> : null}
    </div>
  );
}
